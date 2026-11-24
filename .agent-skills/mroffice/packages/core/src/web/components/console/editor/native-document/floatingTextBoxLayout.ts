/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Anchored text boxes: where the frame is painted, and how a linked chain
 * hands its overflow on.
 *
 * The node itself (`textBox` in `contentControlExtension`) stores the source
 * reading only — `wp:anchor` verbatim. Placement needs a real page: the paper
 * size, the margins and the column the section paints. That only exists in the
 * DOM, so this plugin resolves it there, once per layout pass, and writes the
 * result as inline geometry on the frame.
 *
 * Two jobs:
 *
 * 1. PLACEMENT. Each frame renders as an in-flow wrapper plus the frame box.
 *    `wrapNone` makes the wrapper zero-height and the box absolute against the
 *    sheet, so body text runs under/over the frame exactly as Word paints "In
 *    Front Of Text" / "Behind Text" and the box costs the page NOTHING — which
 *    is the whole point: a two-column poster whose words all live in two
 *    floating boxes is one page in Word, and used to be two here because those
 *    words were flattened into the flow. `wrapSquare`/`wrapTight`/
 *    `wrapThrough` make the wrapper a CSS float so the browser re-wraps the
 *    body around it (with `shape-outside` from the wrap polygon when the file
 *    carries one), and `wrapTopAndBottom` makes it a full-width band.
 *
 * 2. CHAIN FLOW. Word keeps a linked chain's whole story in ONE
 *    `w:txbxContent` and shows the part that did not fit in the next box. The
 *    editor holds the same story as real editable blocks, so the overflow is
 *    moved, block by block, into the next frame's node — the anchors travel
 *    with the paragraphs, so a save still writes every word back into the box
 *    that owns the story.
 *
 * Nothing here decides pagination. A floating object belongs to the page its
 * ANCHOR paragraph is on, which is already true by construction: the frame is
 * a sibling of that paragraph and the paginator moves them together. Word's
 * cached `w:lastRenderedPageBreak` never gets a say.
 */

import { setInkLayerSettler, strokeInLayer, takeStrokeOutOfLayer } from "./paged/inkSheetLayer";
import { msSinceTyping, TYPING_IDLE_MS } from "../../../../lib/typing-session";
import { EMU_PER_PX, ptToPx } from "../../../../lib/office-units";
import { GAP_ADDS_AFTER_ATTR } from "./paragraphSpacingAddsUp";
import { inkTraceWork } from "../../../../lib/ink-input-trace";
import {
  FLOAT_BOTH_SIDES_ATTR,
  FLOAT_BOTH_SIDES_MIN_STRIP_PX,
  FLOAT_SHADOW_ELEMENT_ATTR,
  FLOAT_SHADOW_SPEC_ATTR,
  FLOAT_WRAP_DISTANCES_ATTR,
  type FloatShadowSpec,
  createFloatBandLineSwapPlugin,
  createFloatBothSidesWrapPlugin,
  createFloatShadowWrapPlugin,
  publishFloatBothSides,
  syncFloatShadows,
} from "./floatBothSidesWrap";
import { Extension } from "@tiptap/core";
import type { NodeViewRenderer, NodeViewRendererProps } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  documentTextBoxFillCss,
  documentTextBoxOutlineHtmlAttributes,
  normalizeDocumentTextBoxFill,
} from "../../../../lib/document-borders";
import { documentTextBoxShadowHtmlAttributes } from "../../../../lib/document-text-box-frame";
import {
  emuToPx,
  floatFlowMode,
  floatWhollyInPageMargin,
  floatSide,
  floatStackZIndex,
  floatWrapDistancesPx,
  floatWrapShapeOutside,
  normalizeFloatAnchor,
  normalizeFloatFrameBody,
  normalizeDocumentTextBoxFrameExtent,
  normalizeFloatFrameChain,
  FLOAT_PAGE_ROOM_ATTR,
  BAND_RUN_RIDE_ATTR,
  BAND_RUN_ROOM_ATTR,
  floatPageRoomPx,
  floatLayoutIsModern,
  placeFloatOnPage,
  floatTextStripMinPx,
  resolveFloatPlacement,
  type FloatAnchor,
  type FloatKeepOnPage,
  type FloatPageGeometry,
} from "../../../../lib/office-float-anchor";
import { documentFloatingStack } from "../../../../lib/document-shapes";
import { measureFloatPaint, type FloatPaint } from "../../../../lib/office-float-anchor-edit";
import {
  BAND_LAYER_DRAWN_EVENT,
  bodyObjectsInBandAreas,
  createBandHoles,
  cutBandsAroundBodyObjects,
} from "./paged/bandObjectHoles";
import { attachOfficeTextWarp } from "../../../../lib/office-text-warp-render";
import { TEXT_BOX_NODE_NAME } from "./contentControls";
import { normalizeWordCompatibilityMode } from "./documentOverflowPunctuation";
import { paginationLayoutScale } from "./paged/paginationGeometry";
import { querySheetsAll } from "./paged/sheetMeasureMemo";
import { InkAtRest } from "./paged/inkAtRest";
import { inkPointerArbiter } from "../../../../lib/ink-pointer-policy";
import { SHEET_DORMANT_ATTR } from "./paged/sheetDormancy";
import { measureOutsideEditorObservation } from "./documentLayoutStatus";
import { COLUMN_BAND_EXCLUSION_ATTR, COLUMN_REGIONS_ATTR, FLOAT_HOST_BEFORE_ATTR, unequalColumnPlacementForBlock, type UnequalColumnPlacement } from "./paged/unequalColumnProjection";
import { TextBoxFrameChromeView, recordTextBoxFramePaint } from "./textBoxFrameChrome";

export const FLOATING_TEXT_BOX_META = "floatingTextBoxFlow";

/** A chain pass moves at most this many blocks, so a disagreement between the
 * measured height and the painted one can never spin. */
const MAX_CHAIN_MOVES_PER_PASS = 24;
/** Sub-pixel rounding of insets and zoom is not an overflow. */
const CHAIN_FIT_TOLERANCE_PX = 1;

/**
 * A shape's anchor, parsed once per attribute value: every layout pass reads
 * every floating shape's anchor, and a page of handwriting is hundreds of
 * them (each stroke one shape).
 */
const parsedAnchors = new WeakMap<HTMLElement, { readonly raw: string | null; readonly value: FloatAnchor | null }>();
function shapeAnchor(element: HTMLElement, raw: string | null): FloatAnchor | null {
  const cached = parsedAnchors.get(element);
  if (cached && cached.raw === raw) return cached.value;
  const value = normalizeFloatAnchor(parseJson(element, "data-float-anchor"));
  parsedAnchors.set(element, { raw, value });
  return value;
}

/** A shape wrapper's stage (its first child), looked up once. */
const shapeStages = new WeakMap<HTMLElement, HTMLElement>();
function shapeStage(wrapper: HTMLElement): HTMLElement | null {
  const cached = shapeStages.get(wrapper);
  if (cached && cached.parentElement === wrapper) return cached;
  const stage = wrapper.querySelector<HTMLElement>(":scope > div");
  if (stage) shapeStages.set(wrapper, stage);
  return stage;
}

function parseJson(element: HTMLElement, name: string): unknown {
  const raw = element.getAttribute(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The page a frame sits on, in the sheet's own CSS pixels.
 *
 * Read from computed style rather than client rects so an editor zoom (a CSS
 * transform on an ancestor) does not scale the numbers: the geometry we write
 * back is in the same space the sheet lays out in.
 */
export function sheetGeometry(sheet: HTMLElement, keepOnPage?: FloatKeepOnPage): FloatPageGeometry | null {
  const style = getComputedStyle(sheet);
  const pageWidthPx = sheet.offsetWidth;
  const pageHeightPx = pixels(style.minHeight) || sheet.offsetHeight;
  if (!(pageWidthPx > 0) || !(pageHeightPx > 0)) return null;
  const marginLeftPx = pixels(style.paddingLeft);
  const marginTopPx = pixels(style.paddingTop);
  const marginRightPx = pixels(style.paddingRight);
  const marginBottomPx = pixels(style.paddingBottom);
  return {
    pageWidthPx,
    pageHeightPx,
    marginLeftPx,
    marginTopPx,
    marginRightPx,
    marginBottomPx,
    columnLeftPx: marginLeftPx,
    columnWidthPx: Math.max(0, pageWidthPx - marginLeftPx - marginRightPx),
    mirroredEvenPage: sheet.dataset.pagePhysicalParity === "even",
    ...(keepOnPage ? { keepOnPage } : {}),
  };
}

/** Word's keep-on-page facts for the body of `view`'s document. */
export function bodyKeepOnPage(view: EditorView): FloatKeepOnPage {
  return {
    wordCompatibilityMode: normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode),
    headerFooter: false,
  };
}

function publishFloatPageRoom(wrapper: HTMLElement, anchor: FloatAnchor, geometry: FloatPageGeometry): void {
  const room = floatPageRoomPx(anchor, geometry);
  const value = room === null ? null : room.toFixed(1);
  if (value === null) {
    if (wrapper.hasAttribute(FLOAT_PAGE_ROOM_ATTR)) wrapper.removeAttribute(FLOAT_PAGE_ROOM_ATTR);
  } else if (wrapper.getAttribute(FLOAT_PAGE_ROOM_ATTR) !== value) {
    wrapper.setAttribute(FLOAT_PAGE_ROOM_ATTR, value);
  }
}

/**
 * A table CELL as the containing block a shape anchored inside it floats in.
 *
 * `wp:anchor/@layoutInCell` ("Layout In Table Cell", on by default) says a
 * drawing anchored in a cell is positioned against the CELL, not the page, and
 * Word draws it there reserving no flow space at all. Reading the page instead
 * put such a shape back in the cell's flow, where four flat lines in one D050
 * cell each took a block of its own and made the cell far taller than Word
 * draws it (SHAPE-IMPORT-AUDIT.md §54).
 *
 * The cell's padding box is its "page margin", so a `column`-relative offset --
 * which is what Word's own `text`-relative VML origin becomes -- is measured
 * from the cell's text, exactly as it is from the body's column.
 */
function cellGeometry(cell: HTMLElement): FloatPageGeometry | null {
  const style = getComputedStyle(cell);
  const widthPx = cell.offsetWidth;
  const heightPx = cell.offsetHeight;
  if (!(widthPx > 0) || !(heightPx > 0)) return null;
  const marginLeftPx = pixels(style.paddingLeft);
  const marginTopPx = pixels(style.paddingTop);
  const marginRightPx = pixels(style.paddingRight);
  const marginBottomPx = pixels(style.paddingBottom);
  return {
    pageWidthPx: widthPx,
    pageHeightPx: heightPx,
    marginLeftPx,
    marginTopPx,
    marginRightPx,
    marginBottomPx,
    columnLeftPx: marginLeftPx,
    columnWidthPx: Math.max(0, widthPx - marginLeftPx - marginRightPx),
    // A cell is never a mirrored page.
    mirroredEvenPage: false,
  };
}

/**
 * On a float anchored in a table cell but drawn at its PAGE point, out of the
 * flow: "Layout in table cell" off (`layoutInCell="0"`, VML's
 * `o:allowincell="f"`) places it against the page, and Word draws it there,
 * outside the table (Shape.LayoutInCell: False is "displayed outside the
 * table"; D050's lines, SHAPE-IMPORT-AUDIT.md §54). The node is still the
 * cell's child, and the table clips its overflow, so a box standing above the
 * table was cut away whole: H33 A10's sixteen "8 厘米" labels and answer lines,
 * placed in the page's top margin, missing on screen and from the PDF the
 * editor prints. A table holding one does not clip (note-editor.css).
 */
export const FLOAT_PAGE_FROM_CELL_ATTR = "data-float-page-from-cell";

/**
 * What the float pass wrote on a wrapper to place it out of the flow: its
 * styles, its page room, its both-sides and shadow specs. A shape's node view
 * that is no longer floating clears them (`clearFloatLayoutState`): the pass
 * only visits floating wrappers, so nothing else ever would.
 *
 * ProseMirror hands a node view the next node of its type at its place in the
 * document (`update`), floating or not. An In Line with Text rule drawn by a
 * view that had held a floating shape kept that shape's `position: absolute`,
 * its both-sides mark and its page room for good, half a pixel of the page
 * below it gone (float.docx sheet 7, a 0.05 pt wps rule before "7. Ressourcen
 * ..."): whether it did turned on which view the page's moves had handed it,
 * so one opening laid the page out one way and the next another.
 */
const FLOAT_LAYOUT_WRAPPER_STYLES = ["position", "left", "top", "float", "clear", "margin", "margin-top", "shape-outside"] as const;

export function clearFloatLayoutState(wrapper: HTMLElement): void {
  const attributes = [
    FLOAT_BOTH_SIDES_ATTR,
    FLOAT_PAGE_ROOM_ATTR,
    FLOAT_WRAP_DISTANCES_ATTR,
    FLOAT_SHADOW_SPEC_ATTR,
    FLOAT_PAGE_FROM_CELL_ATTR,
    FLOAT_OVERHANG_ATTR,
  ];
  for (const name of attributes) if (wrapper.hasAttribute(name)) wrapper.removeAttribute(name);
  for (const property of FLOAT_LAYOUT_WRAPPER_STYLES) if (wrapper.style.getPropertyValue(property)) wrapper.style.removeProperty(property);
  if (wrapper.getAttribute("style") === "") wrapper.removeAttribute("style");
}

function markFloatPageFromCell(wrapper: HTMLElement, fromCell: boolean): void {
  // Written only when it changes: every pass writing it marked the sheet changed.
  if (wrapper.hasAttribute(FLOAT_PAGE_FROM_CELL_ATTR) !== fromCell) {
    wrapper.toggleAttribute(FLOAT_PAGE_FROM_CELL_ATTR, fromCell);
  }
}

/** Every anchored frame the editor currently paints, with its own sheet. */
/**
 * Everything a layout pass places, in one walk of the document: the floating
 * text boxes, shapes and pictures, and the band objects (Top and Bottom) a
 * run of which is stacked. Five selector walks a pass each visited every
 * element of the document, every stroke of ink's drawing included.
 */
/**
 * What the float pass places as it places a picture: a floating picture's
 * wrapper, and a floating chart's (`ChartBlock`, `data-chart-float`). Word
 * lays a chart's `wp:anchor` out exactly as a picture's -- the same Layout
 * Options, the same wrap -- so one placement serves both.
 */
export const PICTURE_LIKE_FLOAT_SELECTOR = ".note-editor-image-resizable, [data-chart-float]";

const LAYOUT_OBJECT_SELECTOR =
  "div[data-text-box][data-float-anchor], figure[data-document-shape], .note-editor-image-resizable[data-float-mode], [data-chart-float][data-float-mode], [data-float-shadow]";

interface LayoutObjects {
  /** Every floating text box frame wrapper. */
  readonly wrappers: HTMLElement[];
  /** Every floating `documentShape` the editor currently paints. */
  readonly shapes: HTMLElement[];
  /** Every floating picture (`image` node view) the editor currently paints. */
  readonly pictures: HTMLElement[];
  /** Shapes set as Top and Bottom bands. */
  readonly bandShapes: HTMLElement[];
  /**
   * What may be a band once the pictures are placed (their placement decides),
   * in document order: band shapes and pictures with a float mode.
   */
  readonly bandCandidates: HTMLElement[];
  /** Wrappers publishing a float shadow spec (FLOAT_SHADOW_SPEC_ATTR), read after the pass. */
  readonly all: HTMLElement[];
}

function layoutObjects(root: HTMLElement): LayoutObjects {
  const objects: LayoutObjects = { wrappers: [], shapes: [], pictures: [], bandShapes: [], bandCandidates: [], all: [] };
  // Each sheet's objects are kept while nothing in it changed: the pass runs
  // after every view update (a caret move too).
  for (const element of querySheetsAll(root, LAYOUT_OBJECT_SELECTOR)) {
    objects.all.push(element);
    const anchored = element.hasAttribute("data-float-anchor");
    if (element.tagName === "FIGURE" && element.hasAttribute("data-document-shape")) {
      if (anchored && element.hasAttribute("data-float-mode")) objects.shapes.push(element);
      if (element.getAttribute("data-float-band") === "true") {
        objects.bandShapes.push(element);
        objects.bandCandidates.push(element);
        continue;
      }
    } else if (element.tagName === "DIV" && anchored && element.hasAttribute("data-text-box")) {
      objects.wrappers.push(element);
    }
    if (element.matches(PICTURE_LIKE_FLOAT_SELECTOR) && element.hasAttribute("data-float-mode")) {
      objects.bandCandidates.push(element);
      if (anchored) objects.pictures.push(element);
    }
  }
  return objects;
}

/** The inline declarations a picture's placement wrote, as one string the
 * node view puts back after it resets the wrapper's style. */
export const PICTURE_FLOAT_CSS_ATTR = "data-picture-float-css";

/**
 * Place one floating picture, the way a floating shape is placed. Square /
 * Tight / Through: the wrapper is a CSS float with Word's wrap distances as
 * margins, so the sheet's lines re-wrap around it and the paginator measures
 * their wrapped heights (the float itself costs the page nothing, see
 * `ledgerAtoms.isOutOfVerticalFlow`). Top and Bottom: a cleared block at the
 * anchor's horizontal position. In Front of / Behind Text: the wrapper is
 * taken out of the flow entirely and set at the anchor's page point, under
 * or over the text by the floating stack's order.
 */
function applyPicturePlacement(
  wrapper: HTMLElement,
  anchor: FloatAnchor,
  geometry: FloatPageGeometry,
  sheet: HTMLElement,
  stack: readonly number[],
  flowTopPx: number,
  originPx: { leftPx: number; topPx: number },
  parentOriginPx: { leftPx: number; topPx: number },
  shadow: FloatShadowSpec | typeof DROPPED_WRAPS_NOTHING | null,
): void {
  const placement = placeFloatOnPage(anchor, { ...geometry, flowTopPx });
  publishFloatPageRoom(wrapper, anchor, { ...geometry, flowTopPx });
  const distances = floatWrapDistancesPx(anchor);
  // A wrapped picture wholly in the top or bottom margin wraps no line: it is
  // drawn where Word puts it and takes no room from the body, as a text box
  // there is (applyPlacement). As a float in its paragraph it could not rise
  // above that paragraph: a picture centred in the top margin was drawn at
  // its paragraph, 266pt below Word's place.
  const mode =
    floatFlowMode(anchor) !== "overlay" && !wrapper.closest("td, th") && floatWhollyInPageMargin(placement, distances, geometry)
      ? "overlay"
      : floatFlowMode(anchor);
  // A float cannot start above its own place in the flow, but it can start
  // lower: a picture 0.3" below its paragraph's top leaves the lines above
  // it full width, as Word draws it.
  const topMarginPx = wrapTopMarginPx(placement.topPx, originPx.topPx, distances.topPx);
  // The top margin the picture carries now, while it stands in the flow
  // (read before this pass writes anything): a drop within the layout's own
  // rounding of it is that one (steadyDropPx, as a text box's drop is). The
  // flow place is read back from the box less this margin, on 1/64 px steps,
  // and the drop came out a few thousandths off on every pass (R484-D04: a
  // cover picture's 54.1771, 54.1751, 54.1731 ... 54.1847 px over one
  // keystroke's passes); each write marked the cover sheet changed, so every
  // pass measured it again while the plans of pages 6-14 went between two
  // layouts. `window.__docsSteadyPictureDropOff = true` writes each reading
  // for pictures only, as before (A/B).
  const steadyPictureDropOff = typeof window !== "undefined" &&
    (window as Window & { __docsSteadyPictureDropOff?: boolean }).__docsSteadyPictureDropOff === true;
  const inFlowTopPx = wrapper.style.position === "relative" && !steadyPictureDropOff ? Number.parseFloat(wrapper.style.marginTop) : Number.NaN;
  const appliedTopPx = Number.isFinite(inFlowTopPx) ? inFlowTopPx : null;
  const declarations: string[] = [];
  const set = (property: string, value: string) => {
    wrapper.style.setProperty(property, value);
    declarations.push(`${property}:${value}`);
  };
  // Text on both sides (`wrapText="bothSides"` with room for words on each
  // side): no CSS float does that, so the picture leaves the flow and
  // `floatBothSidesWrap` carries each crossing line past it.
  const columnCount = Number.parseInt(getComputedStyle(sheet).columnCount, 10);
  const contentRightPx = geometry.pageWidthPx - geometry.marginRightPx;
  const bothSides =
    mode === "float" &&
    (anchor.wrap.text ?? "bothSides") === "bothSides" &&
    !(columnCount > 1) &&
    !wrapper.closest("td, th") &&
    placement.leftPx - distances.leftPx - geometry.marginLeftPx >= FLOAT_BOTH_SIDES_MIN_STRIP_PX &&
    contentRightPx - (placement.leftPx + placement.widthPx + distances.rightPx) >=
      FLOAT_BOTH_SIDES_MIN_STRIP_PX;
  // A band reaching the lines above the paragraph: the picture leaves the
  // flow too, and its shadow in the paragraph above does the wrapping.
  const shadowed = mode === "float" && !bothSides && shadow !== null;
  wrapper.dataset.floatMode = bothSides || shadowed ? "overlay" : mode;
  if (bothSides) wrapper.setAttribute(FLOAT_BOTH_SIDES_ATTR, "true");
  else wrapper.removeAttribute(FLOAT_BOTH_SIDES_ATTR);
  if (shadowed && shadow !== DROPPED_WRAPS_NOTHING) wrapper.setAttribute(FLOAT_SHADOW_SPEC_ATTR, JSON.stringify(shadow));
  else wrapper.removeAttribute(FLOAT_SHADOW_SPEC_ATTR);
  if (mode === "overlay" || bothSides || shadowed) {
    // Out of flow: absolute against the nearest positioned ancestor, so the
    // offsets are the anchor's page point less that ancestor's own origin.
    const applied = appliedOverlayOffsetsPx(wrapper);
    set("position", "absolute");
    set("left", `${steadyOverlayOffsetPx(placement.leftPx - parentOriginPx.leftPx, applied.leftPx)}px`);
    set("top", `${steadyOverlayOffsetPx(placement.topPx - parentOriginPx.topPx, applied.topPx)}px`);
    set("margin", "0");
    set("float", "none");
    set("max-width", "none");
    // The rank is a variable the raster and its drawings paint with
    // (note-editor.css), never the wrapper's own z-index: a ranked wrapper
    // is a stacking context, and the selection chrome inside it could then
    // never paint over the next float up (ImageResizeNodeView).
    set("--picture-float-rank", String(floatStackZIndex(anchor, stack)));
    set("pointer-events", "auto");
    set("shape-outside", "none");
  } else if (mode === "band") {
    clearOverlayOffsets(wrapper);
    set("position", "relative");
    set("float", "none");
    set("clear", "both");
    set("display", "block");
    set("width", "fit-content");
    set("max-width", "100%");
    // The band's top margin collapses with the space after the block above
    // it; the picture's drop is measured from below that space.
    const bandTopPx = topMarginPx;
    const spaceAbovePx = previousBlockSpaceAfterPx(wrapper);
    // A picture placed from its paragraph's top less far down than that
    // paragraph's space after reaches stands inside that space, as Word draws
    // it (corpus R90-D01: 18 pt below an empty paragraph with 10 pt after --
    // drawn below the space, the picture and the lines after it ended 8.5 pt
    // low and the next line went over to page 2): a negative margin takes the
    // collapsed space back down to where the anchor puts it.
    const intoSpacePx = placement.topPx - originPx.topPx;
    const marginTopPx = bandTopPx > 0
      ? bandTopPx + spaceAbovePx
      : intoSpacePx < 0 && spaceAbovePx > 0
        ? Math.max(distances.topPx - spaceAbovePx, intoSpacePx)
        : 0;
    set("margin-top", `${steadyDropPx(marginTopPx, appliedTopPx)}px`);
    // Room for the line Word sends under the picture (the band line swap).
    const swapRoomPx = Number.parseFloat(wrapper.dataset.bandSwapRoom ?? "") || 0;
    set("margin-bottom", `${distances.bottomPx + swapRoomPx}px`);
    set("margin-left", `${steadyBandLeftPx(wrapper, Math.max(0, placement.leftPx - originPx.leftPx))}px`);
    set("margin-right", "0");
  } else {
    const side = floatSide(anchor, placement, geometry);
    const columns = Number.parseInt(getComputedStyle(sheet).columnCount, 10);
    const single = !(columns > 1);
    const contentRight = geometry.pageWidthPx - geometry.marginRightPx;
    clearOverlayOffsets(wrapper);
    set("position", "relative");
    set("float", side);
    set("clear", "none");
    set("display", "block");
    set("max-width", "100%");
    const steadyTopPx = steadyDropPx(topMarginPx, appliedTopPx);
    set("margin-top", `${steadyTopPx}px`);
    set("margin-bottom", `${distances.bottomPx}px`);
    // A strip too narrow for Word's text beside the object holds none: the
    // margin takes it (R89-D29: a 9pt strip left of a full-width drawing
    // set one letter a line down the page).
    const stripMinPx = floatTextStripMinPx(geometry.keepOnPage);
    if (side === "left") {
      // Negative into the page margin where Word draws it there (kept on
      // the paper by `keepFloatOnPage`).
      set("margin-left", `${single ? placement.leftPx - geometry.marginLeftPx : 0}px`);
      const strip = contentRight - placement.leftPx - placement.widthPx;
      set("margin-right", `${single && strip - distances.rightPx < stripMinPx ? Math.max(distances.rightPx, strip) : distances.rightPx}px`);
    } else {
      set(
        "margin-right",
        `${single ? contentRight - placement.leftPx - placement.widthPx : 0}px`,
      );
      const strip = placement.leftPx - geometry.marginLeftPx;
      set("margin-left", `${single && strip - distances.leftPx < stripMinPx ? Math.max(distances.leftPx, strip) : distances.leftPx}px`);
    }
    const shape = floatWrapShapeOutside(anchor.wrap);
    set("shape-outside", shape ?? ((single && squareFloatDropShape(steadyTopPx, distances.topPx)) || "none"));
    set("shape-margin", shape ? `${Math.max(distances.leftPx, distances.rightPx)}px` : "0px");
  }
  wrapper.setAttribute(PICTURE_FLOAT_CSS_ATTR, declarations.join(";"));
}

/**
 * An overlay's page point, left on the wrapper when an earlier pass drew it
 * out of the flow. In the flow it is `position: relative`, where a stale
 * `left: 192px; top: 144px` moved the float by exactly that much (a picture
 * in the inside margin drawn 144pt right of and 94pt below Word's place).
 */
function clearOverlayOffsets(wrapper: HTMLElement): void {
  wrapper.style.removeProperty("left");
  wrapper.style.removeProperty("top");
}

/**
 * The top margin that sets a wrapped object, in the flow at `originTopPx`, at
 * its page point `placementTopPx`: the object's own box lands there, its wrap
 * distance above it (Word's `distT`, 0.05" on every shape and text box Word
 * inserts) kept clear of the text over it. The margin box cannot start above
 * the flow place, so a drop shorter than the wrap distance leaves the box
 * that much lower. Adding the distance to the drop instead drew every Word
 * shape and text box 3.6pt below its place.
 */
/** A page-placed band this far below its paragraph is a band at its page
 * place rather than a block at its paragraph (two body lines). */
const BAND_AT_PAGE_PLACE_MIN_DROP_PX = 32;

export function wrapTopMarginPx(placementTopPx: number, originTopPx: number, distanceTopPx: number): number {
  return Math.max(distanceTopPx, placementTopPx - originTopPx);
}

/** A drop within this of the one applied is the one applied (px). */
const STEADY_DROP_PX = 1 / 32;

/**
 * The drop to write for an object in the flow: the one it has, when the new
 * one is the same to within the browser's own rounding. The object's flow
 * place is read back from its box less the drop the last pass gave it, and the
 * box stands on the layout's 1/64 px steps: the drop came out a few
 * thousandths of a pixel off on every pass (470.712, 470.719, 470.710 ...),
 * each one a style write that marked its sheet changed, so every pass of a
 * long document started again from the page that holds such a box (R286-D01:
 * its first page, 211 writes in an opening). `appliedPx`: the wrapper's inline
 * top margin while it stands in the flow, else null.
 * `window.__docsSteadyFloatDrop = false` writes each reading (A/B).
 */
export function steadyDropPx(nextPx: number, appliedPx: number | null): number {
  if (appliedPx === null || !Number.isFinite(appliedPx) || !Number.isFinite(nextPx)) return nextPx;
  if (typeof window !== "undefined" && (window as Window & { __docsSteadyFloatDrop?: boolean }).__docsSteadyFloatDrop === false) return nextPx;
  return Math.abs(nextPx - appliedPx) <= STEADY_DROP_PX ? appliedPx : nextPx;
}

/**
 * The offset to write for a picture out of the flow: the one it has, when the
 * new one is the same to within the browser's own rounding, as for a drop in
 * the flow (steadyDropPx). Its anchor's page point is read back from boxes on
 * the layout's 1/64 px steps: R286-D01's first page set a picture's top at
 * 117.80046 and 117.80026 px by turns, a write each time its pages came in,
 * and every one marked the first page changed and laid the document out from
 * there (continued footnotes: to its end). `window.__docsSteadyOverlayOffset
 * = false` writes each reading (A/B).
 */
export function steadyOverlayOffsetPx(nextPx: number, appliedPx: number | null): number {
  if (appliedPx === null || !Number.isFinite(appliedPx) || !Number.isFinite(nextPx)) return nextPx;
  if (typeof window !== "undefined" && (window as Window & { __docsSteadyOverlayOffset?: boolean }).__docsSteadyOverlayOffset === false) return nextPx;
  return Math.abs(nextPx - appliedPx) <= STEADY_DROP_PX ? appliedPx : nextPx;
}

/** The offsets `wrapper` carries while out of the flow (null: none written,
 * or it stands in the flow). */
function appliedOverlayOffsetsPx(wrapper: HTMLElement): { leftPx: number | null; topPx: number | null } {
  if (wrapper.style.position !== "absolute") return { leftPx: null, topPx: null };
  const read = (value: string) => {
    if (!value.endsWith("px")) return null;
    const px = Number.parseFloat(value);
    return Number.isFinite(px) ? px : null;
  };
  return { leftPx: read(wrapper.style.left), topPx: read(wrapper.style.top) };
}

/** The top margin `wrapper` carries as a drop in the flow, or null (out of the
 * flow, or none written yet). */
function appliedDropPx(wrapper: HTMLElement): number | null {
  if (wrapper.style.position === "absolute" || !(wrapper.style.float || wrapper.style.clear === "both")) return null;
  const applied = Number.parseFloat(wrapper.style.marginTop);
  return Number.isFinite(applied) ? applied : null;
}

/** `window.__docsInlineMarginOrigin = true`: the float pass reads the inline
 * top margin for "the margin the box has", as before (A/B). */
function inlineMarginOriginOn(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsInlineMarginOrigin?: boolean }).__docsInlineMarginOrigin === true;
}

/**
 * The top margin `element`'s box was given: its computed value, which is the
 * inline margin a pass wrote unless a rule overrides it. A sheet's first block
 * draws with `margin-top: 0 !important` (the space Word drops at a page's top,
 * note-editor.css), the inline drop of a Top and Bottom picture, text box or
 * shape opening a page included. Read from the inline style, the box was taken
 * to have moved by a margin it never got: its flow place came out that much
 * higher, and the drop grew by as much again on every pass (R484-D04: a
 * picture placed 408 px down its page, opening sheet 17, carried 302.6, 597.2,
 * 891.8 ... 8257.1 px, its sheet measured again each pass and the ledger's
 * edge probe reading the margin as its space before). Every "box less the
 * margin it had" reading of this pass takes this one.
 * `window.__docsInlineMarginOrigin = true` reads the inline value, as before
 * (A/B).
 */
export function givenTopMarginPx(element: HTMLElement): number {
  const inline = Number.parseFloat(element.style.marginTop) || 0;
  if (typeof window === "undefined" || typeof getComputedStyle !== "function" || inlineMarginOriginOn()) return inline;
  const computed = Number.parseFloat(getComputedStyle(element).marginTop);
  const given = Number.isFinite(computed) ? computed : inline;
  // On a projected page of columns the projector stands the box: at a
  // column's top it drops the margin, under a block it collapses it with
  // that block's space after (`marginDroppedPx`).
  return given - (projectedMarginDroppedPx(element) ?? 0);
}

/** What the column projector's last plan left out of `element`'s own top
 * margin, or null when no projected page stands it. */
function projectedMarginDroppedPx(element: HTMLElement): number | null {
  const dropped = unequalColumnPlacementForBlock(element)?.marginDroppedPx;
  return dropped !== undefined && Number.isFinite(dropped) ? dropped : null;
}

/**
 * The left margin to write for a band in the flow: the one it has, when the
 * new one is the same to within the layout's rounding (steadyDropPx). Its flow
 * place is read back from its box less this margin, on 1/64 px steps, and the
 * margin came out a thousandth off on every pass (R484-D04: 99.3572, 99.3561,
 * 99.3550 ... px), each one a style write that marked its sheet changed.
 * `window.__docsSteadyBandLeftOff = true` writes each reading (A/B).
 */
function steadyBandLeftPx(wrapper: HTMLElement, nextPx: number): number {
  if (typeof window !== "undefined" && (window as Window & { __docsSteadyBandLeftOff?: boolean }).__docsSteadyBandLeftOff === true) return nextPx;
  if (wrapper.style.position === "absolute" || !wrapper.style.marginLeft.endsWith("px")) return nextPx;
  const applied = Number.parseFloat(wrapper.style.marginLeft);
  return steadyDropPx(nextPx, Number.isFinite(applied) ? applied : null);
}

/** The shape of a square-wrapped box dropped below its flow place: the lines
 * above it keep their width. The drop is margin, which a float's box would
 * otherwise take from them (corpus R283-D21: a full-width box at 681 pt sent
 * the paragraph after its anchor below it, a page more than Word's). */
export function squareFloatDropShape(dropPx: number, distanceTopPx: number): string {
  const band = Math.max(0, dropPx - distanceTopPx);
  return band > 0.5 ? `inset(${band}px 0px 0px)` : "";
}

/** Space after the block a picture band follows (collapses with its own). */
function previousBlockSpaceAfterPx(wrapper: HTMLElement): number {
  const previous = wrapper.previousElementSibling;
  if (!(previous instanceof HTMLElement)) return 0;
  return Math.max(0, Number.parseFloat(getComputedStyle(previous).marginBottom) || 0);
}

/** How far the wrapper's own top margin moved its box from its flow place. */
function appliedTopMarginShift(wrapper: HTMLElement): number {
  const applied = givenTopMarginPx(wrapper);
  if (wrapper.dataset.floatMode !== "band") return applied;
  // A projected page already took off what collapsed with the space above.
  if (projectedMarginDroppedPx(wrapper) !== null && !inlineMarginOriginOn()) return applied;
  // A band drawn up into the space after the block above (a negative margin,
  // `applyPicturePlacement`) moved up by that much.
  if (applied < 0) return applied;
  return Math.max(0, applied - previousBlockSpaceAfterPx(wrapper));
}

/**
 * Top and Bottom objects of neighbouring paragraphs.
 *
 * Word places each from its OWN paragraph's top, and that top is where the
 * paragraph starts before any object pushed its lines down. A shape 0.2"
 * below paragraph B therefore overlaps the shape 0.3" below paragraph A just
 * above it, and B's text starts under both (Word 16, `wp-verify/b-obj.docx`).
 * In the flow such objects are consecutive blocks, each starting where the
 * one before ends; this moves a later one up to Word's place and keeps the
 * text under the lowest of them.
 */
function layoutBandRuns(
  candidates: readonly HTMLElement[],
  hosts: Map<string, HTMLElement>,
  textBoxBands: readonly HTMLElement[] = [],
): void {
  // Read after the pictures were placed: their placement decides which are bands.
  const bands = candidates.filter(
    (element) =>
      (element.matches(PICTURE_LIKE_FLOAT_SELECTOR) && element.dataset.floatMode === "band") ||
      (element.tagName === "FIGURE" && element.getAttribute("data-float-band") === "true"),
  );
  const bandSet = new Set<Element>(bands);
  const isBand = (element: Element | null): element is HTMLElement =>
    element instanceof HTMLElement && bandSet.has(element);
  // A run holding a text box band or a paragraph between its bands is laid
  // out after the text boxes are placed (`layoutMixedBandRuns`), whole.
  const mixed = mixedBandRunStarts(bands, textBoxBands, hosts);
  for (const first of bands) {
    if (isBand(first.previousElementSibling)) continue; // Not the start of a run.
    const mixedStart = mixed.size > 0 ? mixedRunStartOf(first, bands, textBoxBands, hosts) : null;
    if (mixedStart && mixed.has(mixedStart)) continue;
    liftShapeBandToItsParagraphTop(first, hosts);
    if (!isBand(first.nextElementSibling)) continue; // A run of one keeps its own placement.
    const scale = paginationLayoutScale(first);
    const scaleY = scale.y || 1;
    const firstRect = first.getBoundingClientRect();
    // Where the paragraph after the run would start with no object at all.
    const runStartTop = firstRect.top / scaleY - givenTopMarginPx(first);
    let previousBottom = firstRect.bottom / scaleY;
    let lowest = previousBottom;
    for (
      let band: Element | null = first.nextElementSibling;
      isBand(band);
      band = band.nextElementSibling
    ) {
      const rect = band.getBoundingClientRect();
      const height = rect.height / scaleY;
      const host = band.dataset.floatHostAnchor ? hosts.get(band.dataset.floatHostAnchor) : null;
      let unpushedTop: number | null = null;
      if (host) {
        const hostFollows = Boolean(band.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING);
        unpushedTop = hostFollows ? runStartTop : bandHostTopPx(host, scaleY);
      } else if (band.dataset.floatBandPage === "true") {
        // A Top and Bottom shape the page placed itself is anchored in the
        // paragraph after its run (the Word writers host it there), whose
        // top is where the run starts: every one measures from that one
        // place, side by side or one under another as their offsets say,
        // and the text goes on under the lowest (ECMA-376 §20.4.2.20,
        // wrapTopAndBottom: no text left or right of the object).
        unpushedTop = runStartTop;
      }
      // A picture's own offset; a shape carries its offset inside its stage.
      let offsetPx = 0;
      if (band.matches(PICTURE_LIKE_FLOAT_SELECTOR)) {
        const anchor = normalizeFloatAnchor(parseJson(band, "data-float-anchor"));
        const vertical = anchor?.vertical as { offsetEmu?: number; relativeFrom?: string } | undefined;
        if (!anchor || (vertical?.relativeFrom !== "paragraph" && vertical?.relativeFrom !== "line")) {
          unpushedTop = null;
        } else {
          offsetPx = (vertical.offsetEmu ?? 0) / EMU_PER_PX + floatWrapDistancesPx(anchor).topPx;
        }
      }
      if (unpushedTop === null || !(unpushedTop + offsetPx < previousBottom - 0.5)) {
        // No overlap in Word: the block keeps the placement it has.
        const own = band.getBoundingClientRect();
        previousBottom = own.bottom / scaleY;
        lowest = Math.max(lowest, previousBottom);
        continue;
      }
      const top = unpushedTop + offsetPx;
      const bottom = top + height;
      band.style.marginTop = `${top - previousBottom}px`;
      delete band.dataset.bandLift;
      band.style.marginBottom = `${Math.max(0, lowest - bottom)}px`;
      previousBottom = Math.max(bottom, lowest);
      lowest = Math.max(lowest, bottom);
    }
  }
}

/**
 * Marks each float on a page of column regions whose host paragraph is the
 * flow block just before it (floats between them aside), for the region
 * flow, which measures such a float run from that paragraph's top
 * (`planColumnRegionFlow`, FLOAT_HOST_BEFORE_ATTR).
 */
function markFloatsHostedBefore(elements: readonly HTMLElement[], hosts: Map<string, HTMLElement>): void {
  for (const element of elements) {
    let hostedBefore = false;
    const key = element.dataset.floatHostAnchor;
    const host = key ? hosts.get(key) : null;
    if (host && element.parentElement?.hasAttribute(COLUMN_REGIONS_ATTR)) {
      let previous = element.previousElementSibling;
      while (previous instanceof HTMLElement && previous.hasAttribute("data-float-host-anchor")) previous = previous.previousElementSibling;
      hostedBefore = previous === host;
    }
    if (!hostedBefore) element.removeAttribute(FLOAT_HOST_BEFORE_ATTR);
    else if (element.getAttribute(FLOAT_HOST_BEFORE_ATTR) !== "true") element.setAttribute(FLOAT_HOST_BEFORE_ATTR, "true");
  }
}

/** Whether runs with text box bands and paragraphs between bands are laid out
 * whole (`layoutMixedBandRuns`); `window.__docsBandRunTextBoxOff = true`
 * leaves them to their own placements (A/B). */
function mixedBandRunsOn(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsBandRunTextBoxOff?: boolean }).__docsBandRunTextBoxOff !== true;
}

/** Where a text box laid out by a mixed run takes its margins from: the run
 * writes them ("member"), or only its bottom margin ("first", the run's first
 * object keeps its own drop). `applyPlacement` leaves those to the run. */
const BAND_RUN_ATTR = "data-band-run";

/** A text box set as Top and Bottom in the flow (not a band drawn at its page
 * place as a float). */
function isTextBoxFlowBand(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.tagName === "DIV" &&
    element.hasAttribute("data-text-box") &&
    element.dataset.floatMode === "band" &&
    !element.style.float &&
    !element.closest("td, th")
  );
}

/** The block after `element`, on the next page sheet when it closes its own:
 * a run the paginator cut at a page's foot goes on there. */
function nextAcrossSheets(element: Element): Element | null {
  if (element.nextElementSibling) return element.nextElementSibling;
  const sheet = element.parentElement;
  if (!sheet?.matches("article[data-page-sheet]")) return null;
  let next = sheet.nextElementSibling;
  while (next && !next.matches("article[data-page-sheet]")) next = next.nextElementSibling;
  return next?.firstElementChild ?? null;
}

/** The block before `element`, on the page sheet before when it opens its own. */
function previousAcrossSheets(element: Element): Element | null {
  if (element.previousElementSibling) return element.previousElementSibling;
  const sheet = element.parentElement;
  if (!sheet?.matches("article[data-page-sheet]")) return null;
  let previous = sheet.previousElementSibling;
  while (previous && !previous.matches("article[data-page-sheet]")) previous = previous.previousElementSibling;
  return previous?.lastElementChild ?? null;
}

/**
 * A paragraph standing between two bands of a run that hosts the band after
 * it (`R308-D01`: an empty paragraph holding the citation box and a frame,
 * after the paragraph holding the abstract, author and article boxes).
 */
function isBandRunBridge(
  element: Element | null,
  isBand: (element: Element | null) => element is HTMLElement,
  hosts: Map<string, HTMLElement>,
): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !/^(P|H[1-6])$/.test(element.tagName)) return false;
  if (!isBand(previousAcrossSheets(element))) return false;
  const next = nextAcrossSheets(element);
  if (!isBand(next)) return false;
  const key = next.dataset.floatHostAnchor;
  return Boolean(key) && hosts.get(key!) === element;
}

/** The first object of the mixed run `band` is in, or null. */
function mixedRunStartOf(
  band: HTMLElement,
  bands: readonly HTMLElement[],
  textBoxBands: readonly HTMLElement[],
  hosts: Map<string, HTMLElement>,
): HTMLElement | null {
  if (!mixedBandRunsOn() || textBoxBands.length === 0) return null;
  const all = new Set<Element>([...bands, ...textBoxBands]);
  const isBand = (element: Element | null): element is HTMLElement => element instanceof HTMLElement && all.has(element);
  let first: HTMLElement = band;
  for (;;) {
    const previous = previousAcrossSheets(first);
    if (isBand(previous)) first = previous;
    else if (isBandRunBridge(previous, isBand, hosts)) first = previousAcrossSheets(previous!) as HTMLElement;
    else return first;
  }
}

/** The run starts `layoutMixedBandRuns` lays out: each run holding a text box
 * band or a paragraph between its bands. */
function mixedBandRunStarts(
  bands: readonly HTMLElement[],
  textBoxBands: readonly HTMLElement[],
  hosts: Map<string, HTMLElement>,
): Set<HTMLElement> {
  const starts = new Set<HTMLElement>();
  if (!mixedBandRunsOn()) return starts;
  const all = new Set<Element>([...bands, ...textBoxBands]);
  const isBand = (element: Element | null): element is HTMLElement => element instanceof HTMLElement && all.has(element);
  const textBoxes = new Set<Element>(textBoxBands);
  for (const first of [...bands, ...textBoxBands]) {
    const previous = previousAcrossSheets(first);
    if (isBand(previous) || isBandRunBridge(previous, isBand, hosts)) continue;
    let isMixed = false;
    let length = 0;
    for (let element: Element | null = first; element; element = nextAcrossSheets(element)) {
      if (isBand(element)) {
        length++;
        if (textBoxes.has(element)) isMixed = true;
        continue;
      }
      if (isBandRunBridge(element, isBand, hosts)) {
        isMixed = true;
        continue;
      }
      break;
    }
    if (isMixed && length > 1) starts.add(first);
  }
  return starts;
}

/** Whether a run laid out whole is charged to the paginator as one block
 * (`BAND_RUN_ROOM_ATTR`); `window.__docsBandRunRideOff = true` charges its
 * blocks one by one (A/B). */
function bandRunRidesOn(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsBandRunRideOff?: boolean }).__docsBandRunRideOff !== true;
}

/** The blocks each editor root's last pass charged as runs. */
const bandRunCharged = new WeakMap<HTMLElement, Set<HTMLElement>>();

/** Writes this pass's run charges (`BAND_RUN_ROOM_ATTR` px on a run's first
 * object, `BAND_RUN_RIDE_ATTR` on the rest) and takes back the last pass's
 * that no longer hold. An unchanged value is not written again: the
 * paginator measures a sheet again on any attribute that changes. */
function publishBandRunCharges(view: EditorView, charges: ReadonlyMap<HTMLElement, number | "ride">): void {
  // A run's charges sit on its blocks, and a paragraph between its objects
  // is ProseMirror's own element, not a node view that ignores what is
  // written on it. Written while ProseMirror's DOM observer listened, each
  // such mark was read as an edit of the paragraph: the observer redraws the
  // range of every change it gathered, from the first to the last -- whole
  // pages between two such paragraphs, rebuilt without the column projection
  // their sheets carried, and a document at rest went between two columns
  // and one about every half second (R460-D16: 1,277 sheets rebuilt in three
  // minutes with no input; each rebuilt paragraph lost its mark and the next
  // pass wrote it again). `window.__dqc2BandRunChargesObserved = true` writes
  // them observed, as before (A/B).
  const observed = typeof window !== "undefined" &&
    (window as Window & { __dqc2BandRunChargesObserved?: boolean }).__dqc2BandRunChargesObserved === true;
  if (observed) writeBandRunCharges(view.dom as HTMLElement, charges);
  else measureOutsideEditorObservation(view, () => writeBandRunCharges(view.dom as HTMLElement, charges));
}

function writeBandRunCharges(root: HTMLElement, charges: ReadonlyMap<HTMLElement, number | "ride">): void {
  const before = bandRunCharged.get(root);
  if (before) {
    for (const element of before) {
      if (charges.has(element)) continue;
      element.removeAttribute(BAND_RUN_ROOM_ATTR);
      element.removeAttribute(BAND_RUN_RIDE_ATTR);
    }
  }
  if (charges.size === 0) {
    bandRunCharged.delete(root);
    return;
  }
  for (const [element, charge] of charges) {
    if (charge === "ride") {
      element.removeAttribute(BAND_RUN_ROOM_ATTR);
      if (!element.hasAttribute(BAND_RUN_RIDE_ATTR)) element.setAttribute(BAND_RUN_RIDE_ATTR, "");
      continue;
    }
    element.removeAttribute(BAND_RUN_RIDE_ATTR);
    const value = charge.toFixed(1);
    if (element.getAttribute(BAND_RUN_ROOM_ATTR) !== value) element.setAttribute(BAND_RUN_ROOM_ATTR, value);
  }
  bandRunCharged.set(root, new Set(charges.keys()));
}

/** The margin that, collapsed with its neighbour's `otherPx` (CSS margin
 * collapsing: the largest positive plus the most negative), leaves `gapPx`. */
export function collapsedMarginFor(otherPx: number, gapPx: number): number {
  if (otherPx >= 0) return gapPx >= otherPx ? gapPx : gapPx - otherPx;
  return gapPx >= otherPx ? gapPx - otherPx : gapPx;
}

/**
 * The first top at or below `fromPx` where a block `heightPx` tall crosses no
 * band (`[top, bottom)` each, wrap distances included): Word sets a line
 * between Top and Bottom objects wherever it fits, below them where it does
 * not.
 */
export function firstClearTopPx(fromPx: number, heightPx: number, bands: ReadonlyArray<{ top: number; bottom: number }>): number {
  let top = fromPx;
  for (let moved = true, guard = 0; moved && guard < 64; guard++) {
    moved = false;
    for (const band of bands) {
      if (band.top < top + heightPx - 0.5 && band.bottom > top + 0.5) {
        top = band.bottom;
        moved = true;
      }
    }
  }
  return top;
}

/** Objects past the part of a run that fits its page: they take their own
 * placements again (a text box's from `applyPlacement` on the next pass). */
function releaseBandRunTail(tail: readonly HTMLElement[]): void {
  for (const element of tail) {
    // A text box (unmarked) and a picture take theirs from their own placement.
    if (element.tagName !== "FIGURE") continue;
    if (element.dataset.bandLift === "true") continue;
    element.style.marginTop = "";
    element.style.marginBottom = "";
  }
}

function setMarginPx(element: HTMLElement, property: "marginTop" | "marginBottom", px: number): void {
  const current = Number.parseFloat(element.style[property]);
  if (element.style[property].endsWith("px") && Number.isFinite(current) && Math.abs(current - px) <= STEADY_DROP_PX) return;
  element.style[property] = `${Math.round(px * 64) / 64}px`;
}

/**
 * A run of Top and Bottom objects holding text boxes, or empty paragraphs
 * between its objects, laid out as Word does after the text boxes were
 * placed. Word places each object from its OWN paragraph's top, the top that
 * paragraph has before any object pushed its lines down, and sets each
 * paragraph's line in the first gap between the objects it fits, below all
 * of them where none does (Word 16, R308-D01: three boxes 31.4, 60 and
 * 160.85 pt below one empty paragraph stand there, one over another, and the
 * citation boxes of the paragraph after stand 7.15 and 69.8 pt below where
 * that paragraph starts; its empty line takes the 17 pt between the frame and
 * the abstract). In the flow the objects are consecutive blocks, each one
 * starting where the one before ends: here each is moved to Word's place by
 * its top margin, a paragraph between them by the bottom margin of the object
 * before it, and the last object's bottom margin keeps the text after the run
 * under the lowest.
 */
function layoutMixedBandRuns(
  view: EditorView,
  candidates: readonly HTMLElement[],
  textBoxBands: readonly HTMLElement[],
  hosts: Map<string, HTMLElement>,
): void {
  const charges = new Map<HTMLElement, number | "ride">();
  const bands = candidates.filter(
    (element) =>
      (element.matches(PICTURE_LIKE_FLOAT_SELECTOR) && element.dataset.floatMode === "band") ||
      (element.tagName === "FIGURE" && element.getAttribute("data-float-band") === "true"),
  );
  const starts = mixedBandRunStarts(bands, textBoxBands, hosts);
  const marked = new Set<HTMLElement>();
  const all = new Set<Element>([...bands, ...textBoxBands]);
  const isBand = (element: Element | null): element is HTMLElement => element instanceof HTMLElement && all.has(element);
  for (const first of starts) {
    const members: HTMLElement[] = [];
    for (let element: Element | null = first; element instanceof HTMLElement; element = nextAcrossSheets(element)) {
      if (isBand(element) || isBandRunBridge(element, isBand, hosts)) members.push(element);
      else break;
    }
    // The run is laid out on its first object's page. An object the
    // paginator has sent to a later page (it stood under the run stacked)
    // is laid out there too while it fits on that page: its margins bring
    // it back. One that does not fit goes on as it was.
    const sheet = first.parentElement;
    const contentBottom = sheet?.matches("article[data-page-sheet]")
      ? sheet.getBoundingClientRect().bottom / (paginationLayoutScale(first).y || 1) -
        (Number.parseFloat(getComputedStyle(sheet).paddingBottom) || 0)
      : Number.POSITIVE_INFINITY;
    liftShapeBandToItsParagraphTop(first, hosts);
    const scaleY = paginationLayoutScale(first).y || 1;
    const read = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top / scaleY, bottom: rect.bottom / scaleY, height: rect.height / scaleY };
    };
    // A band's wrapped extent, relative to its own top: a shape's canvas
    // stands inside its figure, below by its offset.
    const extentOf = (element: HTMLElement): { from: number; to: number } => {
      const own = read(element);
      const anchor = normalizeFloatAnchor(parseJson(element, "data-float-anchor"));
      const distances = anchor ? floatWrapDistancesPx(anchor) : { topPx: 0, bottomPx: 0 };
      const canvas = element.tagName === "FIGURE"
        ? element.querySelector<HTMLElement>(":scope > div > [data-document-shape-canvas]")
        : null;
      if (canvas) {
        const inner = read(canvas);
        return { from: inner.top - own.top - distances.topPx, to: inner.bottom - own.top + distances.bottomPx };
      }
      return { from: -distances.topPx, to: own.height + distances.bottomPx };
    };
    const firstRect = read(first);
    const firstApplied = givenTopMarginPx(first);
    // Where the paragraph after the first object's own would start with no
    // object at all.
    const runStartTop = firstRect.top - firstApplied;
    const firstExtent = extentOf(first);
    const placed: Array<{ top: number; bottom: number }> = [
      { top: firstRect.top + firstExtent.from, bottom: firstRect.top + firstExtent.to },
    ];
    const firstHost = first.dataset.floatHostAnchor ? hosts.get(first.dataset.floatHostAnchor) ?? null : null;
    const bridgeTops = new Map<HTMLElement, number>();
    // Each band's place: `null` keeps it under everything above it.
    const targetOf = (band: HTMLElement, chainTop: number): number | null => {
      const host = band.dataset.floatHostAnchor ? hosts.get(band.dataset.floatHostAnchor) ?? null : null;
      let unpushedTop: number | null = null;
      if (host && bridgeTops.has(host)) unpushedTop = bridgeTops.get(host)!;
      else if (host && host.isConnected) {
        const hostFollows = Boolean(band.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING);
        unpushedTop = hostFollows ? chainTop : bandHostTopPx(host, scaleY);
      } else if (band.dataset.floatBandPage === "true") {
        unpushedTop = chainTop;
      }
      if (unpushedTop === null) return null;
      let offsetPx = 0;
      if (band.matches(PICTURE_LIKE_FLOAT_SELECTOR)) {
        const anchor = normalizeFloatAnchor(parseJson(band, "data-float-anchor"));
        const vertical = anchor?.vertical as { offsetEmu?: number; relativeFrom?: string } | undefined;
        if (!anchor || (vertical?.relativeFrom !== "paragraph" && vertical?.relativeFrom !== "line")) return null;
        offsetPx = (vertical.offsetEmu ?? 0) / EMU_PER_PX + floatWrapDistancesPx(anchor).topPx;
      } else if (band.tagName === "DIV") {
        const drop = Number.parseFloat(band.dataset.bandDrop ?? "");
        if (!Number.isFinite(drop)) return null;
        offsetPx = drop;
      }
      let top = unpushedTop + offsetPx;
      // The paragraph above the run keeps its own lines over its objects.
      if (host && host === firstHost && !bridgeTops.has(host) && band.tagName === "DIV") {
        top = Math.max(top, host.getBoundingClientRect().bottom / scaleY);
      }
      return top;
    };
    const heights = new Map<HTMLElement, number>(members.map((element) => [element, read(element).height]));
    const extents = new Map<HTMLElement, { from: number; to: number }>();
    for (const element of members) if (element !== first && isBand(element)) extents.set(element, extentOf(element));
    const margins = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return { before: Number.parseFloat(style.marginTop) || 0, after: Number.parseFloat(style.marginBottom) || 0 };
    };
    // The blocks after the first the run sets in place (the rest released).
    const laidOut: HTMLElement[] = [];
    let previous: HTMLElement = first;
    let previousBottom = firstRect.bottom;
    let previousAfter = 0; // The run writes it: none, unless a paragraph follows.
    let chainTop = runStartTop;
    let lowest = placed[0]!.bottom;
    const ownedBottom = new Map<HTMLElement, number>();
    for (let index = 1; index < members.length; index++) {
      const element = members[index]!;
      // (A set lookup, not the guard: every member is an HTMLElement, and
      // the guard's false branch narrows it to `never`.)
      if (!all.has(element)) {
        // A paragraph between the bands: its objects measure from where it
        // starts; its line goes to the first gap it fits.
        const { before, after } = margins(element);
        bridgeTops.set(element, chainTop);
        const height = heights.get(element)!;
        const own: Array<{ top: number; bottom: number }> = [];
        for (let next = index + 1; next < members.length && isBand(members[next]!); next++) {
          const band = members[next]!;
          if (band.dataset.floatHostAnchor && hosts.get(band.dataset.floatHostAnchor) !== element) continue;
          const top = targetOf(band, chainTop);
          if (top === null) continue;
          const extent = extents.get(band)!;
          own.push({ top: top + extent.from, bottom: top + extent.to });
        }
        const top = firstClearTopPx(chainTop + before, height, [...placed, ...own]);
        if (element.parentElement !== sheet && top + height > contentBottom) {
          releaseBandRunTail(members.slice(index));
          break;
        }
        laidOut.push(element);
        ownedBottom.set(previous, collapsedMarginFor(before, top - previousBottom));
        previous = element;
        previousBottom = top + height;
        previousAfter = after;
        chainTop = previousBottom + after;
        lowest = Math.max(lowest, previousBottom + after);
        continue;
      }
      const target = targetOf(element, chainTop);
      const extent = extents.get(element)!;
      const top = target ?? Math.max(lowest, previousBottom) - extent.from;
      if (element.parentElement !== sheet && top + heights.get(element)! > contentBottom) {
        releaseBandRunTail(members.slice(index));
        break;
      }
      laidOut.push(element);
      const marginTop = collapsedMarginFor(previousAfter, top - previousBottom);
      if (element.tagName === "DIV") marked.add(element);
      setMarginPx(element, "marginTop", marginTop);
      delete element.dataset.bandLift;
      if (!ownedBottom.has(previous)) ownedBottom.set(previous, 0);
      placed.push({ top: top + extent.from, bottom: top + extent.to });
      lowest = Math.max(lowest, top + extent.to);
      previous = element;
      previousBottom = top + heights.get(element)!;
      previousAfter = 0;
    }
    ownedBottom.set(previous, Math.max(0, lowest - previousBottom));
    for (const [element, px] of ownedBottom) {
      if (!isBand(element)) continue; // A paragraph's own margins stay its own.
      if (element.tagName === "DIV") marked.add(element);
      setMarginPx(element, "marginBottom", px);
    }
    // The paginator charges the run as one block, on its first object: down
    // to the lowest object, the rest riding on it.
    if (laidOut.length > 0 && bandRunRidesOn()) {
      charges.set(first, Math.max(0, lowest - firstRect.bottom));
      for (const element of laidOut) charges.set(element, "ride");
    }
  }
  publishBandRunCharges(view, charges);
  for (const wrapper of textBoxBands) {
    const value = marked.has(wrapper) ? (starts.has(wrapper) ? "first" : "member") : null;
    if (value === null) wrapper.removeAttribute(BAND_RUN_ATTR);
    else if (wrapper.getAttribute(BAND_RUN_ATTR) !== value) wrapper.setAttribute(BAND_RUN_ATTR, value);
  }
}

/**
 * The room a run of Top and Bottom shapes drawn from the paragraph before it
 * asks of that paragraph's page, below the paragraph's top (the largest
 * offset plus height in the run), published on the run's first shape for the
 * paginator as a wrapped picture's is (`floatPageRoomPx`). Word 2013 layout
 * keeps such an object on its paragraph's page: with less room left, the
 * paragraph and its shapes open the next page (corpus R282-D02: four grouped
 * pictures 41 pt under "Figure 3", 156 pt tall, a third of the way past the
 * foot; Word set the caption at page 4's top, ours left it at page 3's foot
 * and drew the pictures over a blank page). Word 2010 layout and earlier
 * keep the object on the paper instead: no room is asked.
 */
export function publishShapeBandRooms(candidates: readonly HTMLElement[], hosts: Map<string, HTMLElement>, keepOnPage: FloatKeepOnPage): void {
  const isShapeBand = (element: Element | null): element is HTMLElement =>
    element instanceof HTMLElement && element.tagName === "FIGURE" &&
    element.matches("figure[data-document-shape]") && element.getAttribute("data-float-band") === "true";
  const modern = floatLayoutIsModern(keepOnPage) && !keepOnPage.headerFooter;
  for (const first of candidates) {
    if (!isShapeBand(first) || isShapeBand(first.previousElementSibling)) continue;
    const hostKey = first.dataset.floatHostAnchor;
    const host = hostKey ? hosts.get(hostKey) : null;
    let room = 0;
    if (modern && host && host === first.previousElementSibling && !first.closest("td, th")) {
      const scaleY = paginationLayoutScale(first).y || 1;
      for (let band: Element | null = first; isShapeBand(band); band = band.nextElementSibling) {
        if (band.dataset.floatHostAnchor !== hostKey) continue;
        const shape = band.querySelector<HTMLElement>(":scope > div > [data-document-shape-canvas]");
        if (!shape) continue;
        const offsetPx = Math.max(0, Number.parseFloat(shape.style.marginTop) || 0);
        room = Math.max(room, offsetPx + shape.getBoundingClientRect().height / scaleY);
      }
      room = Math.max(0, room - hostSpaceBeforePx(host));
    }
    for (let band: Element | null = first; isShapeBand(band); band = band.nextElementSibling) {
      const value = band === first && room > 0 ? room.toFixed(1) : null;
      if (value === null) band.removeAttribute(FLOAT_PAGE_ROOM_ATTR);
      else if (band.getAttribute(FLOAT_PAGE_ROOM_ATTR) !== value) band.setAttribute(FLOAT_PAGE_ROOM_ATTR, value);
    }
  }
}

/**
 * Where Word measures a Top and Bottom shape's paragraph offset from: the
 * anchor paragraph's top above its space before, as for every other wrap
 * (`hostSpaceBeforePx`; Word 16.86, probes t-tb2: a rectangle 19 pt below a
 * paragraph with 6.15 pt before stands where it stands under one with none;
 * corpus R281-D21: every row of boxes stood 6.15 pt low).
 */
function bandHostTopPx(host: HTMLElement, scaleY: number): number {
  return host.getBoundingClientRect().top / scaleY - hostSpaceBeforePx(host);
}

/**
 * A Top and Bottom shape set a line or more below its paragraph's top
 * follows that paragraph in the flow (the projection keeps the paragraph's
 * first line above it), so its offset was measured from the paragraph's
 * BOTTOM. Word measures it from the paragraph's top: the shape starts that
 * far below where the paragraph starts, and only the paragraph's own lines
 * hold it lower (`wp-verify/b-obj.docx`, a rectangle 0.3" below a one-line
 * paragraph: 0.1" under the line, not 0.3"). The shape keeps its offset
 * inside its stage; the figure is pulled up by the difference.
 */
function liftShapeBandToItsParagraphTop(band: HTMLElement, hosts: Map<string, HTMLElement>): void {
  const lifted = band.dataset.bandLift === "true";
  const host = band.dataset.floatHostAnchor ? hosts.get(band.dataset.floatHostAnchor) : null;
  const shape = band.querySelector<HTMLElement>(":scope > div > [data-document-shape-canvas]");
  if (!band.matches("figure[data-document-shape]") || !host || host !== band.previousElementSibling || !shape) {
    if (lifted) {
      band.style.marginTop = "";
      delete band.dataset.bandLift;
    }
    return;
  }
  const scaleY = paginationLayoutScale(band).y || 1;
  const applied = lifted ? givenTopMarginPx(band) : 0;
  const naturalTop = band.getBoundingClientRect().top / scaleY - applied;
  const hostRect = host.getBoundingClientRect();
  const offsetPx = Math.max(0, Number.parseFloat(shape.style.marginTop) || 0);
  const shapeTop = Math.max(bandHostTopPx(host, scaleY) + offsetPx, hostRect.bottom / scaleY);
  // Never below the flow place: the lift only ever moves the figure up.
  const lift = Math.min(0, shapeTop - offsetPx - naturalTop);
  if (lift < -0.5) {
    band.style.marginTop = `${lift}px`;
    band.dataset.bandLift = "true";
  } else if (lifted) {
    band.style.marginTop = "";
    delete band.dataset.bandLift;
  }
}

/**
 * The "column" origin of an object on a page whose section the column
 * projector lays out (unequal columns, a balanced region): the column the
 * object's block was projected into, as a table frame there takes it
 * (tablePageFrame). The sheet's geometry knows only the page's text column,
 * so an object anchored in the second of three columns was placed from the
 * first: R455-D56's masthead logo box (277.35 pt right of its column, in the
 * second of 3261 | 5572 | 1483 twips) drew at 312 pt, Word at 480 pt.
 * `window.__docsProjectedColumnOriginOff = true` keeps the page's column (A/B).
 */
function withProjectedColumnOrigin(wrapper: HTMLElement, geometry: FloatPageGeometry): FloatPageGeometry {
  if (typeof window !== "undefined" &&
    (window as Window & { __docsProjectedColumnOriginOff?: boolean }).__docsProjectedColumnOriginOff === true) return geometry;
  let block: HTMLElement | null = wrapper;
  let placement = unequalColumnPlacementForBlock(wrapper);
  while (!placement && block?.parentElement && !block.parentElement.matches("article[data-page-sheet]")) {
    block = block.parentElement;
    placement = unequalColumnPlacementForBlock(block);
  }
  return geometryInProjectedColumn(geometry, placement);
}

/** `geometry` with its "column" origin the projected column `placement` stands in (one of several). */
export function geometryInProjectedColumn(
  geometry: FloatPageGeometry,
  placement: Pick<UnequalColumnPlacement, "inlineStartPx" | "widthPx" | "regionColumns"> | null,
): FloatPageGeometry {
  if (!placement || !((placement.regionColumns ?? 1) > 1) || !(placement.widthPx > 0)) return geometry;
  return { ...geometry, columnLeftPx: geometry.marginLeftPx + placement.inlineStartPx, columnWidthPx: placement.widthPx };
}

function layoutPictures(
  view: EditorView,
  pictures: readonly HTMLElement[],
  hosts: Map<string, HTMLElement>,
  stack: readonly number[],
  keepOnPage: FloatKeepOnPage,
): void {
  for (const wrapper of pictures) {
    // Measured again below when this pass places it; a stale reading would
    // move a drawing from where it no longer is.
    floatPaints.delete(wrapper);
    const anchor = normalizeFloatAnchor(parseJson(wrapper, "data-float-anchor"));
    if (!anchor) continue;
    // A picture hidden in the Selection Pane is not drawn and nothing wraps
    // around it (Word; corpus R20-D04).
    wrapper.toggleAttribute("data-float-hidden", anchor.hidden);
    if (anchor.hidden) {
      wrapper.removeAttribute(FLOAT_PAGE_ROOM_ATTR);
      continue;
    }
    const sheet = wrapper.closest<HTMLElement>("article[data-page-sheet]");
    // "Layout in table cell": a picture floating in a cell is placed against
    // the CELL, as a shape there is (corpus R30-D06). The sheet still says
    // how many columns the section has.
    const inCell = wrapper.closest<HTMLElement>("td, th");
    if (inCell && (!anchor.layoutInCell || floatFlowMode(anchor) !== "overlay")) {
      // Only a picture in front of or behind the text is placed in a cell: it
      // takes no room there. A wrapped one placed by this pass resizes the
      // cell it wraps in, which re-runs the pass, without end (corpus
      // R31-D02: twenty pictures, 16 000 changes a second). It keeps the
      // cell's flow.
      wrapper.removeAttribute(PICTURE_FLOAT_CSS_ATTR);
      wrapper.removeAttribute(FLOAT_SHADOW_SPEC_ATTR);
      wrapper.removeAttribute(FLOAT_PAGE_ROOM_ATTR);
      continue;
    }
    const cell = sheet && inCell ? inCell : null;
    const container = cell ?? sheet;
    let geometry = cell ? cellGeometry(cell) : sheet ? sheetGeometry(sheet, keepOnPage) : null;
    if (!sheet || !container || !geometry) {
      // The continuous surface (no page) keeps the picture's own CSS float.
      wrapper.removeAttribute(PICTURE_FLOAT_CSS_ATTR);
      wrapper.removeAttribute(FLOAT_SHADOW_SPEC_ATTR);
      wrapper.removeAttribute(FLOAT_PAGE_ROOM_ATTR);
      continue;
    }
    const scale = paginationLayoutScale(wrapper);
    const wrapperRect = wrapper.getBoundingClientRect();
    const sheetRect = container.getBoundingClientRect();
    // The wrapper's place in the flow BEFORE its own placement margins: the
    // last pass's margins moved the box, and measuring from the moved box fed
    // them back in (a centred Top and Bottom picture flipped between centred
    // and flush left on alternate passes).
    const shadowed = wrapper.hasAttribute(FLOAT_SHADOW_SPEC_ATTR);
    const applied =
      floatFlowMode(anchor) === "overlay" || wrapper.getAttribute(FLOAT_BOTH_SIDES_ATTR) === "true" || shadowed
      ? { left: 0, top: 0 }
      : {
          left: wrapper.style.float === "right" ? 0 : Number.parseFloat(wrapper.style.marginLeft) || 0,
          top: appliedTopMarginShift(wrapper),
        };
    // A chart's place in the flow is its own block (the node view, which
    // stays in the flow while the chart inside it is placed): measured from
    // the chart once it is placed out of the flow, an overlay's next origin
    // was its own last place, and a chart offset from its paragraph walked
    // down the page by its offset on every pass.
    // A picture with no host paragraph of its own placed out of the flow has
    // no box in the flow at all: its place is under the block before it.
    const flowBlock = wrapper.hasAttribute("data-chart-float")
      ? wrapper.closest<HTMLElement>(".react-renderer")
      : null;
    const flowRect = flowBlock?.getBoundingClientRect();
    const originPx = flowRect
      ? {
          leftPx: (flowRect.left - sheetRect.left) / (scale.x || 1),
          topPx: (flowRect.top - sheetRect.top) / (scale.y || 1),
        }
      : pictureFlowOrigin(wrapper, wrapperRect, sheetRect, scale, applied);
    // An absolutely placed overlay measures from its positioned ancestor.
    const parent = wrapper.offsetParent instanceof HTMLElement ? wrapper.offsetParent : container;
    const parentRect = parent.getBoundingClientRect();
    const parentOriginPx = {
      leftPx: (parentRect.left - sheetRect.left) / (scale.x || 1) + parent.clientLeft,
      topPx: (parentRect.top - sheetRect.top) / (scale.y || 1) + parent.clientTop,
    };
    // A Top and Bottom picture sits in the flow ahead of the paragraph it is
    // anchored to and pushes that paragraph down by its own height: the
    // paragraph's top, for the picture, is where the picture itself starts.
    // A shadowed picture's paragraph is read with the shadow hidden: Word
    // places the picture from the flow BEFORE the lines above it wrapped.
    const shadowElement = shadowed ? currentShadowElement(view, wrapper) : null;
    if (shadowElement) shadowElement.style.display = "none";
    const hostTopPx = cell
      ? flowTopIn(wrapper, cell, hosts, originPx.topPx, scale.y)
      : flowTopOnSheet(wrapper, sheet, hosts, originPx.topPx, scale.y);
    const flowTopPx =
      floatFlowMode(anchor) === "band"
        ? Math.min(cell ? hostTopPx : bandHostTopAcrossSheetPx(wrapper, sheet, hosts, originPx.topPx, scale.y) ?? hostTopPx, originPx.topPx)
        : hostTopPx;
    geometry = withAnchorCharacterOrigins(view, wrapper, anchor, geometry, container, hosts, flowTopPx, scale);
    if (!cell) geometry = withProjectedColumnOrigin(wrapper, geometry);
    // The lines above in the cell are not the page's: no band reaching them.
    const shadow = cell
      ? null
      : (pictureShadowSpec(view, wrapper, anchor, geometry, sheet, hosts, flowTopPx, scale) ??
        droppedPastTableShadow(view, wrapper, anchor, geometry, sheet, hosts, flowTopPx, scale));
    if (shadowElement) shadowElement.style.display = "";
    applyPicturePlacement(wrapper, anchor, geometry, sheet, stack, flowTopPx, originPx, parentOriginPx, shadow);
    // Kept for the Layout Options a drawing takes next (a drag, Move with
    // Text, Fix Position on Page): every origin, on the page.
    const cellShift = cell
      ? {
          leftPx: (sheetRect.left - sheet.getBoundingClientRect().left) / (scale.x || 1),
          topPx: (sheetRect.top - sheet.getBoundingClientRect().top) / (scale.y || 1),
        }
      : { leftPx: 0, topPx: 0 };
    floatPaints.set(wrapper, measureFloatPaint(anchor, { ...geometry, flowTopPx }, scale, cellShift));
  }
}

const floatPaints = new WeakMap<HTMLElement, FloatPaint>();

/**
 * A picture's place in the flow, in px from `sheetRect`: what its paragraph
 * offsets are measured from when its host paragraph is not on its page.
 * Placed out of the flow by an earlier pass (absolute), its own box is where
 * that pass put it, not a place in the flow: measured from it, the paragraph
 * offset was added to the last placement again. R286-D01 opening (pages cut
 * provisionally, host paragraphs on the page before): nine pictures behind the
 * text 61.86 px higher at each pass, seven passes running, off the top of
 * their pages. So an absolute picture stands where the flow would put it
 * (under the block before it), with or without a host of its own; one in the
 * flow is its own box less the margins its placement gave it.
 * `window.__docsPictureOwnBoxOrigin = true` measures a hosted absolute picture
 * from its own box, as before (A/B).
 */
export function pictureFlowOrigin(
  wrapper: HTMLElement,
  wrapperRect: DOMRect,
  sheetRect: DOMRect,
  scale: { x: number; y: number },
  applied: { left: number; top: number },
): { leftPx: number; topPx: number } {
  const ownBox = typeof window !== "undefined" &&
    (window as Window & { __docsPictureOwnBoxOrigin?: boolean }).__docsPictureOwnBoxOrigin === true;
  const outOfFlow = (!ownBox || !wrapper.dataset.floatHostAnchor) && getComputedStyle(wrapper).position === "absolute"
    ? inFlowPlaceOf(wrapper, sheetRect, scale)
    : null;
  return outOfFlow ?? {
    leftPx: (wrapperRect.left - sheetRect.left) / (scale.x || 1) - applied.left,
    topPx: (wrapperRect.top - sheetRect.top) / (scale.y || 1) - applied.top,
  };
}

/**
 * Where a block placed out of the flow would stand in it, in px from
 * `containerRect`: under the last in-flow block before it (after its space
 * after), else at the container's content top; at the content's left edge.
 */
function inFlowPlaceOf(
  element: HTMLElement,
  containerRect: DOMRect,
  scale: { x: number; y: number },
): { leftPx: number; topPx: number } | null {
  const parent = element.parentElement;
  if (!parent) return null;
  const parentStyle = getComputedStyle(parent);
  const parentRect = parent.getBoundingClientRect();
  const contentLeft = parentRect.left + (Number.parseFloat(parentStyle.paddingLeft) || 0) * (scale.x || 1);
  let top = parentRect.top + (Number.parseFloat(parentStyle.paddingTop) || 0) * (scale.y || 1);
  for (let previous = element.previousElementSibling; previous; previous = previous.previousElementSibling) {
    if (!(previous instanceof HTMLElement)) continue;
    const style = getComputedStyle(previous);
    if (style.display === "none" || style.position === "absolute" || style.position === "fixed") continue;
    top = previous.getBoundingClientRect().bottom + Math.max(0, Number.parseFloat(style.marginBottom) || 0) * (scale.y || 1);
    break;
  }
  return {
    leftPx: (contentLeft - containerRect.left) / (scale.x || 1),
    topPx: (top - containerRect.top) / (scale.y || 1),
  };
}

/**
 * How far an in-line drawing stands from its column's left edge, in page px:
 * where Word puts the column offset of a drawing it takes out of the line, so
 * the drawing does not move. Null off the paged surface.
 */
export function inLineDrawingColumnOffsetPx(element: HTMLElement): number | null {
  const sheet = element.closest<HTMLElement>("article[data-page-sheet]");
  const geometry = sheet ? sheetGeometry(sheet) : null;
  if (!sheet || !geometry) return null;
  const scale = paginationLayoutScale(element);
  const leftPx = (element.getBoundingClientRect().left - sheet.getBoundingClientRect().left) / (scale.x || 1);
  return leftPx - (geometry.columnLeftPx ?? geometry.marginLeftPx);
}

/** What the last float pass measured for one placed picture or chart, or
 * null when it has not placed it (in line, hidden, off the paged surface). */
export function floatPaintOf(wrapper: HTMLElement): FloatPaint | null {
  return floatPaints.get(wrapper) ?? null;
}

/** The page `sheet` and its margins, in its own CSS px (for object snapping). */
export function floatSheetGeometry(sheet: HTMLElement): FloatPageGeometry | null {
  return sheetGeometry(sheet);
}

/** Every floating object the last pass placed on `sheet` (text boxes,
 * shapes, pictures, charts), with what it measured for each. */
export function floatedObjectsOn(sheet: HTMLElement): Array<{ element: HTMLElement; paint: FloatPaint }> {
  const out: Array<{ element: HTMLElement; paint: FloatPaint }> = [];
  for (const element of sheet.querySelectorAll<HTMLElement>(LAYOUT_OBJECT_SELECTOR)) {
    const paint = floatPaints.get(element);
    if (paint && element.closest("article[data-page-sheet]") === sheet) out.push({ element, paint });
  }
  return out;
}

// ---------------------------------------------------------------------------
// A side float reaching the lines above its paragraph (see floatBothSidesWrap
// `FLOAT_SHADOW_SPEC_ATTR` for Word's rule and the oracle).
// ---------------------------------------------------------------------------

/** Word wraps a line whose extent only just reaches the band (the oracle's
 * touch is 0.17pt); a line ending 0.47pt above the band stays whole. */
const SHADOW_REACH_TOLERANCE_PX = 0.125;
const MAX_SHADOW_BLOCKS = 8;
const SHADOW_TEXT_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6";
let nextShadowId = 0;

/** A laid-out line of a text block, in the sheet's px: its own box, and its
 * REACH down to the next line's top (the last line's to the end of the
 * paragraph's space after), which is what Word tests the band against. */
interface NaturalLine {
  readonly top: number;
  /** The glyph boxes' bottom. */
  readonly bottom: number;
  /** The line box's bottom: the next line's top, the last line's the
   * paragraph's content bottom. */
  readonly box: number;
  readonly reach: number;
  readonly left: number;
  readonly right: number;
}

function naturalLinesOf(
  block: HTMLElement,
  sheetRect: DOMRect,
  scale: { x: number; y: number },
): NaturalLine[] {
  const range = block.ownerDocument.createRange();
  range.selectNodeContents(block);
  const rects = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
    .map((rect) => ({
      top: (rect.top - sheetRect.top) / (scale.y || 1),
      bottom: (rect.bottom - sheetRect.top) / (scale.y || 1),
      left: (rect.left - sheetRect.left) / (scale.x || 1),
      right: (rect.right - sheetRect.left) / (scale.x || 1),
    }))
    .sort((left, right) => left.top - right.top || left.left - right.left);
  const lines: { top: number; bottom: number; left: number; right: number }[] = [];
  for (const rect of rects) {
    const line = lines[lines.length - 1];
    // A box joins the line it overlaps vertically by more than half of itself.
    if (line && Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top) > (rect.bottom - rect.top) / 2) {
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
    } else {
      lines.push({ ...rect });
    }
  }
  const blockRect = block.getBoundingClientRect();
  const style = getComputedStyle(block);
  const contentBottom =
    (blockRect.bottom - sheetRect.top) / (scale.y || 1) -
    (Number.parseFloat(style.paddingBottom) || 0) -
    (Number.parseFloat(style.borderBottomWidth) || 0);
  const blockEnd = contentBottom + Math.max(0, Number.parseFloat(style.marginBottom) || 0);
  return lines.map((line, index) => {
    const last = index + 1 >= lines.length;
    const box = last ? Math.max(line.bottom, contentBottom) : Math.max(line.bottom, lines[index + 1]!.top);
    return { ...line, box, reach: last ? Math.max(box, blockEnd) : box };
  });
}

function currentShadowElement(view: EditorView, wrapper: HTMLElement): HTMLElement | null {
  const id = wrapper.dataset.floatShadowId;
  if (!id) return null;
  return view.dom.querySelector<HTMLElement>(`[${FLOAT_SHADOW_ELEMENT_ATTR}="${id}"]`);
}

/**
 * The shadow a Square / Tight / Through picture needs, or `null` when its
 * band reaches no line above its paragraph. Measured in the UNWRAPPED flow
 * (the caller hides the shadow in place first), from the picture's host
 * paragraph upwards through the text blocks before it on the same sheet.
 */
/**
 * The shadow a side-wrapped text box or shape needs when Word draws it above
 * its own place in the flow (placed from the page or the margin, or a
 * negative offset from its paragraph): there no CSS float can reach, so the
 * object leaves the flow at its page point and its shadow in the text above
 * wraps the lines, exactly as for a picture. Null when the object starts at or
 * below its flow place (an ordinary float drops to it) or crosses no line.
 */
export function floatStandsAfterHost(host: Element, wrapper: Element): boolean {
  return Boolean(host.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function aboveFlowShadow(
  view: EditorView,
  wrapper: HTMLElement,
  anchor: FloatAnchor,
  geometry: FloatPageGeometry,
  sheet: HTMLElement,
  hosts: Map<string, HTMLElement>,
  flowTopPx: number,
  originTopPx: number,
  scale: { x: number; y: number },
): FloatShadowSpec | null {
  if (floatFlowMode(anchor) !== "float") return null;
  const placement = placeFloatOnPage(anchor, { ...geometry, flowTopPx });
  if (placement.topPx - floatWrapDistancesPx(anchor).topPx >= originTopPx - 0.5) return null;
  return pictureShadowSpec(view, wrapper, anchor, geometry, sheet, hosts, flowTopPx, scale);
}

function pictureShadowSpec(
  view: EditorView,
  wrapper: HTMLElement,
  anchor: FloatAnchor,
  geometry: FloatPageGeometry,
  sheet: HTMLElement,
  hosts: Map<string, HTMLElement>,
  flowTopPx: number,
  scale: { x: number; y: number },
): FloatShadowSpec | null {
  if (floatFlowMode(anchor) !== "float" || wrapper.closest("td, th")) return null;
  // A chart is anchored in a paragraph of its own more often than not (Word's
  // Insert > Chart, and every chart this product writes), which the page
  // holds as the chart's block: its place in the flow is that paragraph's.
  // So is a picture alone in its paragraph: the page holds it as its block.
  const ownBlock = wrapper.hasAttribute("data-chart-float")
    ? wrapper.closest<HTMLElement>(".react-renderer")
    : wrapper.parentElement?.matches("article[data-page-sheet], .ProseMirror")
      ? wrapper
      : null;
  const host =
    (wrapper.dataset.floatHostAnchor ? hosts.get(wrapper.dataset.floatHostAnchor) : null) ?? ownBlock;
  if (!host || host.closest("article[data-page-sheet]") !== sheet) return null;
  if (Number.parseInt(getComputedStyle(sheet).columnCount, 10) > 1) return null;
  const placement = placeFloatOnPage(anchor, { ...geometry, flowTopPx });
  const distances = floatWrapDistancesPx(anchor);
  const band = {
    top: placement.topPx - distances.topPx,
    bottom: placement.topPx + placement.heightPx + distances.bottomPx,
    left: placement.leftPx - distances.leftPx,
    right: placement.leftPx + placement.widthPx + distances.rightPx,
  };
  if (!(band.bottom > band.top && band.right > band.left)) return null;
  const sheetRect = sheet.getBoundingClientRect();
  const crosses = (line: NaturalLine) =>
    line.reach >= band.top - SHADOW_REACH_TOLERANCE_PX &&
    line.top < band.bottom &&
    line.right > band.left + 0.5 &&
    line.left < band.right - 0.5;
  // From compatibility mode 15 Word tests the band against a line's text, not
  // the extra a multiple line spacing adds below it: an object whose top falls
  // in that extra leaves the line whole (Word 16.86, double-spaced probe: a
  // box 2pt or 8pt below line 2's text sends nothing around itself in mode 15
  // and line 2 around it in mode 14; corpus R161-D16's address boxes, each
  // 3.4pt into its label line's 1.85 leading).
  const mode = normalizeWordCompatibilityMode(view.state.doc.attrs.wordCompatibilityMode);
  const textOnlyReach = (block: HTMLElement): ((line: NaturalLine, index: number, lines: readonly NaturalLine[]) => number) | null => {
    if (mode === null || mode < 15) return null;
    const multiple = Number.parseFloat(getComputedStyle(block).getPropertyValue("--document-auto-line-multiple"));
    if (!(multiple > 1)) return null;
    return (line, index, lines) => {
      const top = index > 0 ? lines[index - 1]!.box : line.top;
      const extra = Math.max(0, (line.box - top) * (1 - 1 / multiple));
      return line.reach - extra;
    };
  };
  let found: { block: HTMLElement; line: NaturalLine; below?: boolean; above?: number } | null = null;
  // A picture placed from the page or the margin stands after its paragraph
  // (only one placed from the paragraph goes ahead of it): no CSS float there
  // reaches the paragraph's first line, whatever its band crosses (corpus
  // R279-D02: a portrait 4.65pt below the top margin, anchored in the first
  // paragraph of the page, dropped below that paragraph's four lines).
  const followsHost = floatStandsAfterHost(host, wrapper);
  const hostRect = host.getBoundingClientRect();
  const hostTop = (hostRect.top - sheetRect.top) / (scale.y || 1);
  if (band.top > hostTop + SHADOW_REACH_TOLERANCE_PX) {
    // A DROP: the band starts inside the host paragraph. Word leaves the
    // lines above it whole (tsq-plus40: the first two lines of the anchor
    // paragraph are full, the picture 40pt down takes the third); a CSS
    // float's top margin shortens them too, so a picture that first crosses
    // a later line gets its shadow in the host, cut away above the band.
    // Read with the picture's own float out of the way: in the flow it has
    // already shortened the lines it must not.
    const display = wrapper.style.display;
    if (wrapper.dataset.floatMode === "float") wrapper.style.display = "none";
    const lines = naturalLinesOf(host, sheetRect, scale);
    if (wrapper.dataset.floatMode === "float") wrapper.style.display = display;
    const textReach = textOnlyReach(host);
    const index = textReach
      ? lines.findIndex((line, at) => crosses({ ...line, reach: textReach(line, at, lines) }))
      : lines.findIndex(crosses);
    if (textReach && index < 0 && lines.length > 0 && crosses(lines[lines.length - 1]!)) {
      // The band reaches only the leading below the paragraph's last line:
      // that line stays whole, and the shadow starts below its box (CSS
      // shortens any line whose box the shape overlaps).
      found = { block: host, line: lines[lines.length - 1]!, below: true };
    } else {
      if (index < 0 || (index === 0 && !followsHost)) return null;
      // A line above it the band reaches only in its leading stays whole.
      found = {
        block: host,
        line: lines[index]!,
        ...(textReach && index > 0 ? { above: lines[index - 1]!.box } : {}),
      };
    }
  }
  // Else the topmost text block above the host whose lines the band reaches.
  let element: Element | null = found ? null : host.previousElementSibling;
  for (let steps = 0; element && steps < MAX_SHADOW_BLOCKS; steps += 1) {
    const block = element;
    element = element.previousElementSibling;
    if (!(block instanceof HTMLElement)) break;
    // Objects stand beside the flow: the picture itself, other floats, bands.
    if (block.hasAttribute("data-float-anchor")) continue;
    if (!block.matches(SHADOW_TEXT_BLOCK_SELECTOR)) break;
    const rect = block.getBoundingClientRect();
    const blockTop = (rect.top - sheetRect.top) / (scale.y || 1);
    if (blockTop >= band.bottom) continue;
    const lines = naturalLinesOf(block, sheetRect, scale);
    if (lines.length > 0 && lines[lines.length - 1]!.reach < band.top - SHADOW_REACH_TOLERANCE_PX) break;
    const crossing = lines.find(crosses);
    if (crossing) found = { block, line: crossing };
  }
  if (!found && followsHost) {
    const display = wrapper.style.display;
    if (wrapper.dataset.floatMode === "float") wrapper.style.display = "none";
    const crossing = naturalLinesOf(host, sheetRect, scale).find(crosses);
    if (wrapper.dataset.floatMode === "float") wrapper.style.display = display;
    if (crossing) found = { block: host, line: crossing };
  }
  if (!found) return null;
  return shadowSpecAt(view, wrapper, anchor, geometry, sheetRect, scale, placement, band, distances, found);
}

type FloatBand = { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };

/** The shadow of `band` in `found.block`, from the line it first takes. */
function shadowSpecAt(
  view: EditorView,
  wrapper: HTMLElement,
  anchor: FloatAnchor,
  geometry: FloatPageGeometry,
  sheetRect: DOMRect,
  scale: { x: number; y: number },
  placement: { leftPx: number; topPx: number; widthPx: number; heightPx: number },
  band: FloatBand,
  distances: { leftPx: number; rightPx: number },
  found: { block: HTMLElement; line: NaturalLine; below?: boolean; above?: number },
): FloatShadowSpec | null {
  const { block, line } = found;
  const style = getComputedStyle(block);
  const rect = block.getBoundingClientRect();
  const contentTop = (rect.top - sheetRect.top) / (scale.y || 1) + (Number.parseFloat(style.paddingTop) || 0);
  const contentLeft = (rect.left - sheetRect.left) / (scale.x || 1) + (Number.parseFloat(style.paddingLeft) || 0);
  const contentRight = (rect.right - sheetRect.left) / (scale.x || 1) - (Number.parseFloat(style.paddingRight) || 0);
  // CSS shortens a line only when the shape overlaps the line's own box: a
  // band that reaches the line through its space after is raised into it.
  const shadowTop = found.below
    ? Math.max(contentTop, band.top, line.box + 0.25)
    : Math.max(contentTop, found.above ?? contentTop, Math.min(band.top, line.box - 0.5));
  const left = Math.max(band.left, contentLeft);
  const right = Math.min(band.right, contentRight);
  const widthPx = Math.round((right - left) * 4) / 4;
  const heightPx = Math.round((band.bottom - contentTop) * 4) / 4;
  if (!(widthPx > 0.5 && heightPx > 0.5)) return null;
  const side = floatSide(anchor, placement, geometry);
  const marginSidePx = Math.round(Math.max(0, side === "right" ? contentRight - right : left - contentLeft) * 4) / 4;
  const inset = Math.round((shadowTop - contentTop) * 4) / 4;
  // Tight / Through: the picture's wrap polygon, in the shadow's own px, when
  // the whole picture lies inside the paragraph's measure.
  let shapeOutside = `inset(${inset}px 0 0 0)`;
  let shapeMarginPx = 0;
  const polygon = anchor.wrap.polygon;
  if (
    polygon && polygon.length >= 3 && inset >= band.top - contentTop - 0.01 &&
    placement.leftPx >= left - 0.01 && placement.leftPx + placement.widthPx <= right + 0.01 &&
    !polygon.some(([x, y]) => x < 0 || y < 0 || x > 21600 || y > 21600)
  ) {
    const offsetX = placement.leftPx - left;
    const offsetY = placement.topPx - contentTop;
    shapeOutside = `polygon(${polygon
      .map(([x, y]) => `${(offsetX + (x / 21600) * placement.widthPx).toFixed(2)}px ${(offsetY + (y / 21600) * placement.heightPx).toFixed(2)}px`)
      .join(", ")})`;
    shapeMarginPx = Math.max(distances.leftPx, distances.rightPx);
  }
  const pos = view.posAtDOM(block, 0);
  if (!(pos > 0)) return null;
  if (!wrapper.dataset.floatShadowId) wrapper.dataset.floatShadowId = String(++nextShadowId);
  return {
    id: wrapper.dataset.floatShadowId,
    pos,
    side,
    widthPx,
    heightPx,
    marginSidePx,
    shapeOutside,
    shapeMarginPx,
  };
}

/**
 * A float placed from the page well below its paragraph, with a table in the
 * drop: Word sets the table in its place and wraps only what reaches the
 * object (corpus R283-D21, Word's PDF: a full-width text box at 681pt
 * anchored in the form's first paragraph, the form's two tables at about
 * 190pt and 300pt, one page). A CSS float is dropped by its top margin, and a
 * table, a block with its own formatting context, never overlaps a float's
 * MARGIN box (`shape-outside` frees only line boxes): the table, and the rest
 * of the form after it, went below the box and onto a second page.
 *
 * So the object leaves the flow at its page point, and the first text block
 * after the table whose lines the band reaches takes its shadow, as a band
 * above its paragraph does (`pictureShadowSpec`); `DROPPED_WRAPS_NOTHING` when
 * no line on the sheet reaches it. A table the band itself reaches, a block
 * that is neither text nor table in the way, or a text block the band reaches
 * before any table, keeps the plain float as it was.
 */
export const DROPPED_WRAPS_NOTHING = "dropped-wraps-nothing" as const;
const MAX_DROP_BLOCKS = 40;

function isTableBlock(element: Element): boolean {
  return element.matches(".tableWrapper, table");
}

export function droppedPastTableShadow(
  view: EditorView,
  wrapper: HTMLElement,
  anchor: FloatAnchor,
  geometry: FloatPageGeometry,
  sheet: HTMLElement,
  hosts: Map<string, HTMLElement>,
  flowTopPx: number,
  scale: { x: number; y: number },
): FloatShadowSpec | typeof DROPPED_WRAPS_NOTHING | null {
  if (floatFlowMode(anchor) !== "float" || wrapper.closest("td, th")) return null;
  const host = wrapper.dataset.floatHostAnchor ? hosts.get(wrapper.dataset.floatHostAnchor) : null;
  if (!host || host.parentElement !== sheet) return null;
  // Read from the DOM alone first: most floats have no table after them.
  const following: HTMLElement[] = [];
  let tableFollows = false;
  for (let element = host.nextElementSibling; element && following.length < MAX_DROP_BLOCKS; element = element.nextElementSibling) {
    if (!(element instanceof HTMLElement)) continue;
    following.push(element);
    if (isTableBlock(element)) tableFollows = true;
  }
  if (!tableFollows) return null;
  if (Number.parseInt(getComputedStyle(sheet).columnCount, 10) > 1) return null;
  const placement = placeFloatOnPage(anchor, { ...geometry, flowTopPx });
  const distances = floatWrapDistancesPx(anchor);
  const band: FloatBand = {
    top: placement.topPx - distances.topPx,
    bottom: placement.topPx + placement.heightPx + distances.bottomPx,
    left: placement.leftPx - distances.leftPx,
    right: placement.leftPx + placement.widthPx + distances.rightPx,
  };
  if (!(band.bottom > band.top && band.right > band.left)) return null;
  const sheetRect = sheet.getBoundingClientRect();
  const sheetY = (value: number) => (value - sheetRect.top) / (scale.y || 1);
  const crosses = (line: NaturalLine) =>
    line.reach >= band.top - SHADOW_REACH_TOLERANCE_PX &&
    line.top < band.bottom &&
    line.right > band.left + 0.5 &&
    line.left < band.right - 0.5;
  // Read with the object's own float out of the way: in the flow it is what
  // pushed the table down.
  const display = wrapper.style.display;
  const hide = wrapper.dataset.floatMode === "float";
  if (hide) wrapper.style.display = "none";
  try {
    const hostRect = host.getBoundingClientRect();
    if (band.top <= sheetY(hostRect.bottom) + (Number.parseFloat(getComputedStyle(host).marginBottom) || 0)) return null;
    let pastTable = false;
    for (const block of following) {
      const rect = block.getBoundingClientRect();
      if (sheetY(rect.top) >= band.bottom) break;
      if (block.hasAttribute("data-float-anchor") || block.hasAttribute(FLOAT_SHADOW_ELEMENT_ATTR)) continue;
      if (isTableBlock(block)) {
        if (sheetY(rect.bottom) > band.top - SHADOW_REACH_TOLERANCE_PX) return null;
        pastTable = true;
        continue;
      }
      if (!block.matches(SHADOW_TEXT_BLOCK_SELECTOR)) {
        if (sheetY(rect.bottom) > band.top - SHADOW_REACH_TOLERANCE_PX) return null;
        continue;
      }
      const line = naturalLinesOf(block, sheetRect, scale).find(crosses);
      if (!line) continue;
      if (!pastTable) return null;
      return shadowSpecAt(view, wrapper, anchor, geometry, sheetRect, scale, placement, band, distances, { block, line });
    }
    return pastTable ? DROPPED_WRAPS_NOTHING : null;
  } finally {
    if (hide) wrapper.style.display = display;
  }
}

// ---------------------------------------------------------------------------
// Floating document shapes: the same anchor model, the same resolver.
// ---------------------------------------------------------------------------

/**
 * How a `documentShape` takes part in the body flow.
 *
 * Only a shape that carries its source anchor can leave the flow, and the
 * anchor's own wrap element decides how: `wp:wrapNone` (In Front Of / Behind
 * Text) is an overlay that costs the page nothing, Square / Tight / Through a
 * side float, and Top and Bottom keeps the in-flow block. The page's
 * `wrapMode` is not consulted for an anchored shape: the save writer keeps
 * the package's wrap element, so the file's wrap is the one in force. An
 * In Line shape has no anchor at all.
 */
/**
 * What places a Top and Bottom shape across: its anchor's horizontal origin
 * and alignment, with the shape's live offset (what a drag edits) where the
 * axis states an offset. An aligned axis imports with offset 0; a drag adds
 * to the live offset, which moves the shape from its aligned place as far as
 * the drag went. Null when the shape keeps the column's edge as its origin
 * anyway (column or margin with an offset in a single column), so the node
 * view's own margin is already Word's place.
 */
export function documentShapeBandAcrossAnchor(
  floatAnchor: unknown,
  xEmu: number,
  widthEmu: number,
): { relativeFrom: string; align?: string; offsetEmu?: number; nudgeEmu?: number; widthEmu: number } | null {
  const anchor = normalizeFloatAnchor(floatAnchor);
  if (!anchor) return null;
  const { relativeFrom, align } = anchor.horizontal;
  if (!align && (relativeFrom === "column" || relativeFrom === "margin" || relativeFrom === "character")) return null;
  return align ? { relativeFrom, align, nudgeEmu: xEmu, widthEmu } : { relativeFrom, offsetEmu: xEmu, widthEmu };
}

/**
 * A Top and Bottom shape across the page, as Word places it: from its own
 * horizontal origin (the page, a page margin, inside/outside) or aligned in
 * it. The node view's margin measures every offset from the column's edge
 * and knows no alignment, so a shape centred in the margin was drawn flush
 * left and one 2" from the page edge 1" too far right.
 */
function placeBandShapesAcross(bandShapes: readonly HTMLElement[]): void {
  for (const figure of bandShapes) {
    const raw = figure.dataset.bandAcross;
    if (!raw) continue;
    const sheet = figure.closest<HTMLElement>("article[data-page-sheet]");
    const shape = figure.querySelector<HTMLElement>("[data-document-shape-canvas]");
    if (!sheet || !shape || figure.closest("td, th")) continue;
    let across: { relativeFrom: string; align?: string; offsetEmu?: number; nudgeEmu?: number; widthEmu: number };
    try {
      across = JSON.parse(raw);
    } catch {
      continue;
    }
    const geometry = sheetGeometry(sheet);
    if (!geometry) continue;
    const anchor = normalizeFloatAnchor({
      horizontal: across.align ? { relativeFrom: across.relativeFrom, align: across.align } : { relativeFrom: across.relativeFrom, offsetEmu: across.offsetEmu ?? 0 },
      vertical: { relativeFrom: "paragraph", offsetEmu: 0 },
      widthEmu: across.widthEmu,
      heightEmu: 1,
      wrap: { kind: "topAndBottom" },
    });
    if (!anchor) continue;
    const placement = resolveFloatPlacement(anchor, geometry);
    const scale = paginationLayoutScale(figure);
    const stage = shape.parentElement ?? figure;
    // The canvas may be wider than the shape (a stroke thicker than a flat
    // line): the shape's own box is centred in it.
    const canvasWidth = Number.parseFloat(shape.style.width) || shape.offsetWidth;
    const pad = Math.max(0, (canvasWidth - emuToPx(across.widthEmu)) / 2);
    const stageLeft =
      (stage.getBoundingClientRect().left - sheet.getBoundingClientRect().left) / (scale.x || 1) +
      (Number.parseFloat(getComputedStyle(stage).paddingLeft) || 0);
    const margin = `${placement.leftPx + emuToPx(across.nudgeEmu ?? 0) - stageLeft - pad}px`;
    if (shape.style.marginLeft !== margin) shape.style.marginLeft = margin;
  }
}

/** Whether a shape is Word's Top and Bottom: in the flow, anchored. */
export function documentShapeIsTopAndBottom(floatAnchor: unknown, wrapMode: unknown): boolean {
  const anchor = normalizeFloatAnchor(floatAnchor);
  return Boolean(anchor) && wrapMode !== "inline" && floatFlowMode(anchor!) === "band";
}

export function documentShapeFloatMode(
  wrapMode: unknown,
  floatAnchor: unknown,
): "overlay" | "float" | "flow" {
  const anchor = normalizeFloatAnchor(floatAnchor);
  if (!anchor || wrapMode === "inline") return "flow";
  const mode = floatFlowMode(anchor);
  return mode === "band" ? "flow" : mode;
}

/**
 * The anchor a floating shape is laid out with.
 *
 * The file's anchor supplies the ORIGINS (`relativeFrom`, alignment), the wrap
 * element and `behindDoc`; the shape's live attributes supply what a user
 * changes — its size and its offsets (`xEmu`/`yEmu`, what a drag edits and
 * what the writer puts back into `wp:posOffset`). For an overlay the offsets
 * are zeroed here, because the shape paints them itself as its own margins
 * inside a stage parked at offset (0, 0).
 */
export function documentShapeFloatLayoutAnchor(
  floatAnchor: unknown,
  attrs: { wrapMode: string; xEmu: number; yEmu: number; widthEmu: number; heightEmu: number },
): FloatAnchor | null {
  const anchor = normalizeFloatAnchor(floatAnchor);
  const mode = documentShapeFloatMode(attrs.wrapMode, floatAnchor);
  if (!anchor || mode === "flow") return null;
  const overlay = mode === "overlay";
  // An aligned axis, and an axis at Word 2010's relative position
  // (`percentOffset`, a share of its origin's extent), are placed by the
  // file's own statement: the shape's live offset of such an axis is the
  // Fallback's absolute place for the page Word saved it on, from ANOTHER
  // origin (Word writes it from the page), so reading it from the Choice's
  // origin drew a shape 25 % across the margins 72 pt right of Word. A move
  // restates the axis as an offset first (`documentShapePercentAxesMoved`).
  const axis = <T extends { relativeFrom: string; offsetEmu?: number; align?: string; percentOffset?: number }>(
    source: T,
    live: number,
  ): T =>
    source.align || typeof source.percentOffset === "number"
      ? source
      : ({ relativeFrom: source.relativeFrom, offsetEmu: overlay ? 0 : live } as T);
  return {
    ...anchor,
    horizontal: axis(anchor.horizontal, attrs.xEmu),
    vertical: axis(anchor.vertical, attrs.yEmu),
    widthEmu: attrs.widthEmu,
    heightEmu: attrs.heightEmu,
    groupTransform: undefined,
  };
}

/** Whether a floating shape's anchor places this axis at a relative
 * (percent) position, so its live offset is not painted (`documentShapeFloatLayoutAnchor`). */
export function documentShapeAxisIsPercent(floatAnchor: unknown, axis: "horizontal" | "vertical"): boolean {
  const anchor = normalizeFloatAnchor(floatAnchor);
  const value = anchor?.[axis];
  return Boolean(value && !value.align && typeof value.percentOffset === "number");
}

/**
 * A floating shape at a relative (percent) position, moved: what Word writes
 * (Word 16.86, wps-position-parity Gpct-moved.docx, the shape's left set
 * through Word): the moved axis becomes an absolute offset from the SAME
 * origin (`wp:positionH relativeFrom="margin"` with `wp:posOffset`, the
 * `mc:AlternateContent` gone); an axis that did not move keeps its percent.
 * `next` is the live offsets the move asks for, each the current one plus
 * the move; the painted place (`paint`) is where the percent put the shape.
 * Null when no percent axis moved (the live offsets stand as asked).
 */
export function documentShapePercentAxesMoved(
  floatAnchor: unknown,
  current: { readonly xEmu: number; readonly yEmu: number },
  next: { readonly xEmu: number; readonly yEmu: number },
  paint: FloatPaint | null,
): { xEmu: number; yEmu: number; floatAnchor: Record<string, unknown> } | null {
  if (!paint || !floatAnchor || typeof floatAnchor !== "object") return null;
  const raw = floatAnchor as Record<string, unknown>;
  const result = { xEmu: next.xEmu, yEmu: next.yEmu, floatAnchor: { ...raw } };
  let converted = false;
  for (const axis of ["horizontal", "vertical"] as const) {
    if (!documentShapeAxisIsPercent(floatAnchor, axis)) continue;
    const key = axis === "horizontal" ? "xEmu" : "yEmu";
    const deltaEmu = next[key] - current[key];
    if (deltaEmu === 0) continue;
    const relativeFrom = (raw[axis] as { relativeFrom: string }).relativeFrom;
    const origin =
      axis === "horizontal"
        ? paint.originsH[relativeFrom as keyof FloatPaint["originsH"]]
        : paint.originsV[relativeFrom as keyof FloatPaint["originsV"]];
    if (typeof origin !== "number") continue;
    const painted = axis === "horizontal" ? paint.leftPx : paint.topPx;
    result[key] = Math.round((painted - origin) * EMU_PER_PX) + deltaEmu;
    result.floatAnchor[axis] = { relativeFrom, offsetEmu: 0 };
    converted = true;
  }
  return converted ? result : null;
}

/**
 * The source anchor of the paragraph a floating object is anchored in.
 *
 * `…#p[2]/shape[0]`, `…#p[2]/group[0]`, `…#p[2]/vml[0]`, `…#p[2]/image[0]`
 * and `…#p[2]/txbxframe[1]` all hang off `…#p[2]`: Word measures a
 * `paragraph`/`line` origin from THAT paragraph, wherever the object's own
 * node ended up in the editor's block order. `vml` is the name a VML shape
 * standing on the page carries, and leaving it out gave every one of them the
 * fallback instead of its own host paragraph; `image` is an anchored picture.
 * `diagram` is a floating SmartArt the page keeps as a preserved drawing:
 * without its host a Top and Bottom diagram 0.2" below its paragraph was
 * measured from the paragraph's bottom, 12 pt below Word's place (Word
 * 16.86, wps-position-parity S04: 158.4 pt; `liftShapeBandToItsParagraphTop`).
 */
export function floatHostParagraphAnchor(source: unknown): string | null {
  // Moved onto another paragraph in the editor (floatReanchor): the
  // paragraph it is anchored to now, as Word's anchor follows a moved object.
  const moved = source && typeof source === "object" ? (source as Record<string, unknown>).hostAnchor : null;
  if (typeof moved === "string" && /#(?:.+\/)?p\[\d+\]$/.test(moved)) return moved;
  const anchor =
    source && typeof source === "object"
      ? (source as Record<string, unknown>).sourceAnchor
      : typeof source === "string"
        ? source
        : null;
  if (typeof anchor !== "string") return null;
  const match = /^(.+#(?:.+\/)?p\[\d+\])\/(?:shape|group|vml|image|txbxframe|chart|diagram)\[\d+\]$/.exec(anchor);
  return match ? match[1] : null;
}

/** `…#tbl[1]/cell[12,0]/p[0]` -> the paragraph ordinal INSIDE that cell. */
const CELL_HOST_PARAGRAPH = /\/cell\[\d+,\d+\]\/p\[(\d+)\]$/;

/**
 * Which paragraph of its CELL a host anchor names, or `null` when the anchor
 * does not name one.
 *
 * A paragraph in a table cell publishes no `source` of its own, so this is the
 * only thing an anchor can be matched on inside a cell: its ordinal. A BODY
 * anchor (`…#p[12]`) returns `null` — those paragraphs carry their own
 * `sourceAnchor` and are found by name.
 */
export function floatHostCellParagraphOrdinal(anchor: string): number | null {
  const match = CELL_HOST_PARAGRAPH.exec(anchor);
  return match ? Number(match[1]) : null;
}

/**
 * The host paragraph of an object anchored INSIDE a table cell.
 *
 * A paragraph in a cell carries no `source`, so the anchor
 * `…#tbl[1]/cell[12,0]/p[0]` matches no node by name and every shape in that
 * cell fell back to its OWN flow position — four shapes anchored at the same
 * `p[0]` each took a different origin, and D050's four rules landed 186/188/
 * 211/238 px below the cell top instead of Word's evenly spaced 50/98/146/194
 * (SHAPE-IMPORT-AUDIT.md §58).
 *
 * So the cell is reached through the SHAPE's own position instead of through
 * the anchor's name, and the ordinal is counted against the textblocks that
 * cell really publishes. Two honest refusals, both landing on the cell itself
 * — ONE common origin for every shape in it, which is still far closer than
 * each shape's own flow position:
 *
 *   * the shape is not in a cell at all (the anchor says it is, so the page
 *     is not the one this anchor describes);
 *   * the cell publishes fewer textblocks than the ordinal asks for (the
 *     projection dropped one, or the paginator moved it), because guessing
 *     which survivor is the k-th would be a second, unverifiable claim.
 *
 * A paragraph the paginator split begins where its FIRST fragment is, which
 * is what walking the cell's children in order gives.
 */
function cellHostParagraphElement(
  view: EditorView,
  element: HTMLElement,
  ordinal: number,
): HTMLElement | null {
  let position: number;
  try {
    position = view.posAtDOM(element, 0);
  } catch {
    return null;
  }
  if (!Number.isInteger(position) || position < 0) return null;
  const resolved = view.state.doc.resolve(Math.min(position, view.state.doc.content.size));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      continue;
    }
    const start = resolved.start(depth);
    let seen = 0;
    let offset = 0;
    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      if (child.isTextblock) {
        if (seen === ordinal) {
          const dom = view.nodeDOM(start + offset);
          return dom instanceof HTMLElement ? dom : null;
        }
        seen += 1;
      }
      offset += child.nodeSize;
    }
    return null;
  }
  return null;
}

/**
 * The editor element of each host paragraph a floating object names, by its
 * source anchor. The first fragment wins: a paragraph the paginator split
 * begins where its first fragment is.
 */
function hostParagraphElements(
  view: EditorView,
  elements: readonly HTMLElement[],
): Map<string, HTMLElement> {
  const wanted = new Set<string>();
  for (const element of elements) {
    const host = element.getAttribute("data-float-host-anchor");
    if (host) wanted.add(host);
  }
  const found = new Map<string, HTMLElement>();
  if (wanted.size === 0) return found;
  view.state.doc.descendants((node, pos) => {
    if (found.size === wanted.size) return false;
    if (!node.isTextblock) return true;
    const source = node.attrs?.source as Record<string, unknown> | null | undefined;
    const anchor = source && typeof source.sourceAnchor === "string" ? source.sourceAnchor : null;
    if (anchor && wanted.has(anchor) && !found.has(anchor)) {
      const dom = view.nodeDOM(pos);
      if (dom instanceof HTMLElement) found.set(anchor, dom);
    }
    return false;
  });
  // What no node CLAIMS by name may still be findable by place: a cell's own
  // paragraphs publish no anchor at all. One cell anchor names one cell, so
  // the first object naming it resolves it for every object that does.
  for (const element of elements) {
    const host = element.dataset.floatHostAnchor;
    if (!host || found.has(host)) continue;
    const ordinal = floatHostCellParagraphOrdinal(host);
    if (ordinal === null) continue;
    const paragraph = cellHostParagraphElement(view, element, ordinal);
    if (paragraph) found.set(host, paragraph);
  }
  return found;
}

/**
 * Where a `paragraph`/`line` origin is on the wrapper's page: the top of the
 * object's own host paragraph when that paragraph is painted on the same
 * sheet, otherwise the wrapper's own flow position.
 */
function flowTopOnSheet(
  wrapper: HTMLElement,
  sheet: HTMLElement,
  hosts: Map<string, HTMLElement>,
  fallbackTopPx: number,
  scaleY: number,
): number {
  const host = wrapper.dataset.floatHostAnchor ? hosts.get(wrapper.dataset.floatHostAnchor) : null;
  if (!host || host.closest("article[data-page-sheet]") !== sheet) return fallbackTopPx;
  // Nor in another column of a projected page: the object stands where the
  // flow carried it past its paragraph, as one on the next page does. Placed
  // from a paragraph a column away, its drop was that paragraph's height on
  // the page and gone when the object went over to the next page, and the
  // page ledger, reading the drop as its space before, sent it back and forth
  // (R460-D16: Figure 3's box, 96 px on page 5's top, 700 px under its
  // paragraph's column on page 4). `window.__docsHostAcrossColumnsMeasured =
  // true` places it from that paragraph, as before (A/B).
  if (hostInAnotherColumn(wrapper, host)) return fallbackTopPx;
  // On a column-projected page the paragraph is placed below the floats in
  // front of it; it starts, for them, where the flow put it (as a paragraph
  // a float pushes aside does). Read from its moved box, each placement
  // moved the paragraph, and the next placement the pictures again: a
  // picture 0.26" below its paragraph ran down to the page's foot (R30-D07).
  const pushedPx = unequalColumnPlacementForBlock(host)?.floatPushPx ?? 0;
  return (host.getBoundingClientRect().top - sheet.getBoundingClientRect().top) / (scaleY || 1) - pushedPx - hostSpaceBeforePx(host);
}

function hostInAnotherColumn(wrapper: HTMLElement, host: HTMLElement): boolean {
  if (typeof window !== "undefined" && (window as Window & { __docsHostAcrossColumnsMeasured?: boolean }).__docsHostAcrossColumnsMeasured === true) return false;
  const own = unequalColumnPlacementForBlock(wrapper);
  const hosted = unequalColumnPlacementForBlock(host);
  if (!own || !hosted) return false;
  return own.columnIndex !== hosted.columnIndex || own.regionColumns !== hosted.regionColumns;
}

/**
 * A Top and Bottom picture drawn from the paragraph before it that opens a
 * sheet of its own while that paragraph ends the sheet before: where the
 * paragraph's top would stand were it just above the picture, px from the
 * sheet. The fallback (the picture's own flow place) measured the offset
 * from the paragraph's BOTTOM: the band asked its whole offset as margin
 * above it, and the ledger, charging paragraph + offset + picture, never let
 * the two share a page (corpus R472-D78 p[175]: a 921 px picture 31.6 px
 * below a 24 px paragraph, 976.6 px for a 967.5 px column; Word measures from
 * the top, 952.6 px, and draws both on one page). Null when the host is on
 * this sheet, follows the picture, or something else stands between them.
 * `window.__docsBandHostAcrossSheetOff = true` keeps the fallback (A/B).
 */
function bandHostTopAcrossSheetPx(
  wrapper: HTMLElement,
  sheet: HTMLElement,
  hosts: Map<string, HTMLElement>,
  originTopPx: number,
  scaleY: number,
): number | null {
  if (typeof window !== "undefined" &&
    (window as Window & { __docsBandHostAcrossSheetOff?: boolean }).__docsBandHostAcrossSheetOff === true) return null;
  const hostKey = wrapper.dataset.floatHostAnchor;
  const host = hostKey ? hosts.get(hostKey) : null;
  if (!host) return null;
  const hostSheet = host.closest("article[data-page-sheet]");
  if (!hostSheet || hostSheet === sheet || host.parentElement !== hostSheet) return null;
  if (!(host.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING)) return null;
  // The block of the sheet the picture is drawn in (its node view's, if any).
  let block: HTMLElement = wrapper;
  while (block.parentElement && block.parentElement !== sheet) block = block.parentElement;
  if (block.parentElement !== sheet) return null;
  const inFlow = (element: Element): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.position !== "absolute" && style.position !== "fixed";
  };
  // Another picture of the same paragraph (a band itself, or holding one).
  const sameHost = (element: HTMLElement): boolean =>
    element.dataset.floatHostAnchor === hostKey ||
    element.querySelector(`[data-float-mode="band"][data-float-host-anchor="${CSS.escape(hostKey!)}"]`) !== null;
  // The picture opens its sheet (after its paragraph's other pictures only)...
  for (let previous = block.previousElementSibling; previous; previous = previous.previousElementSibling) {
    if (inFlow(previous) && !sameHost(previous)) return null;
  }
  // ...and its paragraph ends the sheet before (its pictures after it only).
  for (let next = host.nextElementSibling; next; next = next.nextElementSibling) {
    if (inFlow(next) && !sameHost(next)) return null;
  }
  return originTopPx - host.getBoundingClientRect().height / (scaleY || 1) - hostSpaceBeforePx(host);
}

/**
 * The paragraph's own space before as it stands on the page. An object placed
 * from its paragraph is measured from the top of that space, not from the
 * first line (Word 16.86, g-l7anch, modes 14 and 15, none / square / top and
 * bottom: 20 pt from a paragraph with 30 pt before stands 10 pt above the
 * line). A page that dropped the space has none to take off. What the
 * paragraph draws for the space after above it (`GAP_ADDS_AFTER_ATTR`) is not
 * its own.
 */
export function hostSpaceBeforePx(host: HTMLElement): number {
  const marginPx = Number.parseFloat(getComputedStyle(host).marginTop) || 0;
  if (!(marginPx > 0)) return 0;
  const addedPt = Number.parseFloat(host.getAttribute(GAP_ADDS_AFTER_ATTR) ?? "") || 0;
  return Math.max(0, marginPx - ptToPx(addedPt));
}

/**
 * The same measurement against any containing block -- the page sheet, or the
 * table CELL a `layoutInCell` shape is placed in. A host paragraph outside the
 * container cannot say where the flow is inside it, so the wrapper's own top
 * stands in.
 */
function flowTopIn(
  wrapper: HTMLElement,
  container: HTMLElement,
  hosts: Map<string, HTMLElement>,
  fallbackTopPx: number,
  scaleY: number,
  rectOf: (element: HTMLElement) => DOMRect = (element) => element.getBoundingClientRect(),
): number {
  const anchor = wrapper.getAttribute("data-float-host-anchor");
  const host = anchor ? hosts.get(anchor) : null;
  if (!host || !container.contains(host)) {
    // An object anchored in a CELL whose host paragraph could not be resolved
    // takes the cell's own top: one common origin for every object in that
    // cell, which is what their shared anchor says they have. Each taking its
    // own flow position instead is what scattered D050's four evenly spaced
    // rules (SHAPE-IMPORT-AUDIT.md §58).
    return anchor && floatHostCellParagraphOrdinal(anchor) !== null ? 0 : fallbackTopPx;
  }
  return (rectOf(host).top - rectOf(container).top) / (scaleY || 1) - hostSpaceBeforePx(host);
}

/**
 * The `character` and `line` origins of an anchor that states its place in
 * its host paragraph's text (`anchorTextOffset`), in px from `container`'s
 * top-left: the left edge of the character just before the anchor (the
 * line's start when none is) and the top of the line holding it, as Word
 * measures them (Word 16.86, wps-position-parity Gchar: a box 0" from the
 * character after "ANCHOR C1space " stands at the left edge of that space;
 * one anchored on the third line of its paragraph is placed from that
 * line's top). The geometry is returned unchanged when the anchor states no
 * place, or its host paragraph is not painted in the container.
 */
export function withAnchorCharacterOrigins(
  view: EditorView,
  wrapper: HTMLElement,
  anchor: FloatAnchor,
  geometry: FloatPageGeometry,
  container: HTMLElement,
  hosts: Map<string, HTMLElement>,
  flowTopPx: number,
  scale: { x: number; y: number },
): FloatPageGeometry {
  const offset = anchor.anchorTextOffset;
  if (offset === undefined) return geometry;
  if (anchor.horizontal.relativeFrom !== "character" && anchor.vertical.relativeFrom !== "line") return geometry;
  const hostAnchor = wrapper.dataset.floatHostAnchor;
  const host = hostAnchor ? hosts.get(hostAnchor) : null;
  if (!host || !container.contains(host)) return geometry;
  const coords = anchorCharacterCoords(view, host, offset);
  if (!coords) return geometry;
  const containerRect = container.getBoundingClientRect();
  const sx = scale.x || 1;
  const sy = scale.y || 1;
  const leftPx = (coords.left - containerRect.left) / sx;
  // The line box around the character: its glyph box centred in the line
  // (CSS half-leading). On the paragraph's first line that is the paragraph's
  // top below its space before.
  const lineHeight = Number.parseFloat(getComputedStyle(host).lineHeight);
  const centrePx = ((coords.top + coords.bottom) / 2 - containerRect.top) / sy;
  const firstLineTopPx = flowTopPx + hostSpaceBeforePx(host);
  let lineTopPx = firstLineTopPx;
  if (Number.isFinite(lineHeight) && lineHeight > 0) {
    const candidate = centrePx - lineHeight / 2;
    if (candidate > firstLineTopPx + lineHeight / 2) lineTopPx = candidate;
  }
  return { ...geometry, flowLeftPx: leftPx, lineTopPx };
}

/** Client rect of the character just before `offset` characters of the
 * paragraph's text (of its first character when `offset` is 0). */
function anchorCharacterCoords(
  view: EditorView,
  host: HTMLElement,
  offset: number,
): { left: number; top: number; bottom: number } | null {
  let inside: number;
  try {
    inside = view.posAtDOM(host, 0);
  } catch {
    return null;
  }
  const doc = view.state.doc;
  if (!Number.isInteger(inside) || inside < 0 || inside > doc.content.size) return null;
  const resolved = doc.resolve(inside);
  const paragraph = resolved.parent;
  if (!paragraph.isTextblock) return null;
  const start = resolved.start();
  const wanted = Math.max(0, offset - 1);
  let seen = 0;
  let target: number | null = null;
  paragraph.forEach((child, childOffset) => {
    if (target !== null || !child.isText) return;
    const length = child.text?.length ?? 0;
    if (seen + length > wanted) target = start + childOffset + (wanted - seen);
    seen += length;
  });
  // Past the paragraph's text (the text changed since import): its end.
  const position = target ?? (offset === 0 ? start : start + paragraph.content.size);
  try {
    const rect = view.coordsAtPos(position, 1);
    return { left: rect.left, top: rect.top, bottom: rect.bottom };
  } catch {
    return null;
  }
}

/**
 * Where an in-front-of / behind-text shape's stage is parked: at the page
 * point offset (0, 0) resolves to; the shape inside adds its own offsets as
 * margins, so a drag moves exactly `xEmu`/`yEmu`.
 */
function overlayStagePosition(
  anchor: FloatAnchor,
  geometry: FloatPageGeometry,
  flowTopPx: number,
  originPx: { leftPx: number; topPx: number },
): { left: string; top: string } {
  const placement = placeFloatOnPage(anchor, { ...geometry, flowTopPx });
  return {
    left: stagePx(placement.leftPx - originPx.leftPx),
    top: stagePx(placement.topPx - originPx.topPx),
  };
}

/** A stage position in CSS px to a thousandth: float noise between passes is not a move. */
function stagePx(value: number): string {
  return `${Math.round(value * 1000) / 1000 || 0}px`;
}

type StageProperty = "left" | "top" | "translate";
/** Per stage and property, the value last asked for and what the CSSOM made of it. */
const stagePlaced = new WeakMap<HTMLElement, Partial<Record<StageProperty, { asked: string; seen: string }>>>();









function placeStageProperty(stage: HTMLElement, property: StageProperty, value: string): void {
  let placed = stagePlaced.get(stage);
  if (!placed) {
    placed = {};
    stagePlaced.set(stage, placed);
  }
  const current = stage.style[property];
  const last = placed[property];
  if (last && last.asked === value && last.seen === current) return;
  if (current !== value) stage.style[property] = value;
  placed[property] = { asked: value, seen: stage.style[property] };
}

function placeOverlayStage(stage: HTMLElement, at: { left: string; top: string; canvasTranslate?: string }): void {
  placeStageProperty(stage, "left", at.left);
  placeStageProperty(stage, "top", at.top);
  // The fraction of an ink stroke's place rides on its drawing (`paint`),
  // never on the stage or the canvas (`inkStageOnWholePixels`): a translate
  // makes its box a stacking context, and on the canvas it shut the stroke's
  // float rank inside it, so a stroke on top of a shape anchored later in the
  // text was drawn under it (WUA 208). `paint` carries the rank already.
  placeStageProperty(stage, "translate", "");
  const canvas = stageCanvas(stage);
  if (canvas) {
    placeStageProperty(canvas, "translate", "");
    const paint = canvas.querySelector<HTMLElement>(":scope > [data-document-shape-paint]");
    if (paint) placeStageProperty(paint, "translate", at.canvasTranslate ?? "");
  }
}

const PAGE_SURFACE_SELECTOR = '[data-testid="note-editor-page-surface"]';






















/** The part of an offset on screen below a whole pixel of the page's own. */
function subPixel(offset: number, scale: number): number {
  const pixels = offset / (scale || 1);
  const part = Math.round((pixels - Math.floor(pixels)) * 1000) / 1000;
  return part >= 1 ? 0 : part;
}

function inkStageOnWholePixels(
  wrapper: HTMLElement,
  stage: HTMLElement,
  at: { left: string; top: string },
  wrapperRect: DOMRect,
  scale: { x: number; y: number },
  pass?: ShapeLayoutPass,
): { left: string; top: string; canvasTranslate?: string } {
  const column = wrapper.closest<HTMLElement>(PAGE_SURFACE_SELECTOR);
  const leftPx = Number.parseFloat(at.left);
  const topPx = Number.parseFloat(at.top);
  if (!column || !Number.isFinite(leftPx) || !Number.isFinite(topPx)) return at;
  let columnRect = pass?.columnRects.get(column);
  if (!columnRect) {
    columnRect = column.getBoundingClientRect();
    pass?.columnRects.set(column, columnRect);
  }
  const shape = stage.querySelector<HTMLElement>("[data-document-shape-canvas]");
  const marginLeft = Number.parseFloat(shape?.style.marginLeft ?? "") || 0;
  const marginTop = Number.parseFloat(shape?.style.marginTop ?? "") || 0;
  // Where the drawing starts in the column's own pixels.
  const x = (wrapperRect.left - columnRect.left) / (scale.x || 1) - column.clientLeft + leftPx + marginLeft;
  const y = (wrapperRect.top - columnRect.top) / (scale.y || 1) - column.clientTop + topPx + marginTop;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return at;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  if (fx < 1e-6 && fy < 1e-6) return at;
  return { left: stagePx(leftPx - fx), top: stagePx(topPx - fy), canvasTranslate: `${stagePx(fx)} ${stagePx(fy)}` };
}

/** A floating shape the page placed itself (no host paragraph read from a
 *  file) with such a shape right before or after it: shapes that measure
 *  from one place in the flow, laid out side by side by their offsets. */
function pageFloatShape(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.tagName === "FIGURE" &&
    element.hasAttribute("data-document-shape") &&
    element.hasAttribute("data-float-anchor") &&
    !element.dataset.floatHostAnchor &&
    element.dataset.floatMode === "float"
  );
}

function pageFloatRunMember(wrapper: HTMLElement): boolean {
  return pageFloatShape(wrapper) && (pageFloatShape(wrapper.previousElementSibling) || pageFloatShape(wrapper.nextElementSibling));
}

function applyShapePlacement(
  wrapper: HTMLElement,
  stage: HTMLElement,
  anchor: FloatAnchor,
  geometry: FloatPageGeometry,
  sheet: HTMLElement,
  flowTopPx: number,
  originPx: { leftPx: number; topPx: number },
  shadow: FloatShadowSpec | typeof DROPPED_WRAPS_NOTHING | null = null,
): void {
  const placement = placeFloatOnPage(anchor, { ...geometry, flowTopPx });
  publishFloatPageRoom(wrapper, anchor, { ...geometry, flowTopPx });
  if (wrapper.dataset.floatMode === "overlay") {
    placeOverlayStage(stage, overlayStagePosition(anchor, geometry, flowTopPx, originPx));
    return;
  }
  // Square / Tight / Through: a real CSS float, so the browser re-wraps the
  // body around it and every later block measures its true wrapped height.
  const distances = floatWrapDistancesPx(anchor);
  // Text on both sides, as for a picture (`floatBothSidesWrap`): the shape
  // leaves the flow at its page point and the crossing lines are carried
  // past it.
  const shapeColumns = Number.parseInt(getComputedStyle(sheet).columnCount, 10);
  const bothSides =
    (anchor.wrap.text ?? "bothSides") === "bothSides" &&
    !(shapeColumns > 1) &&
    !wrapper.closest("td, th") &&
    placement.leftPx - distances.leftPx - geometry.marginLeftPx >= FLOAT_BOTH_SIDES_MIN_STRIP_PX &&
    geometry.pageWidthPx - geometry.marginRightPx - (placement.leftPx + placement.widthPx + distances.rightPx) >=
      FLOAT_BOTH_SIDES_MIN_STRIP_PX;
  // Out of the flow at its page point too, as a picture or a text box is:
  // wholly in the top or bottom margin (no line to wrap), or above its flow
  // place with its shadow in the text above doing the wrapping. As a float
  // it could not rise above its paragraph: a shape centred in the top margin
  // was drawn 266pt low, one 3" below the page top 72pt low.
  const inMargin = !wrapper.closest("td, th") && floatWhollyInPageMargin(placement, distances, geometry);
  // Shapes the page placed side by side (a flow chart's boxes and arrows)
  // each stand at their own page point, as Word draws them; as CSS floats
  // each one's offset was counted from the float before it, and a second
  // box in a row dropped below the first. They leave the flow at their
  // page points and the lines crossing them are carried past each one
  // (`floatBothSidesWrap`), a box at the column's edge wrapping on its open
  // side only (a partial obstacle, as a floating table is).
  const inRun = !bothSides && !inMargin && !shadow && pageFloatRunMember(wrapper);
  if (inRun) {
    wrapper.setAttribute(
      FLOAT_WRAP_DISTANCES_ATTR,
      JSON.stringify({ top: distances.topPx, right: distances.rightPx, bottom: distances.bottomPx, left: distances.leftPx }),
    );
  } else {
    wrapper.removeAttribute(FLOAT_WRAP_DISTANCES_ATTR);
  }
  const shadowed = !bothSides && !inMargin && !inRun && shadow !== null;
  if (shadowed && shadow !== DROPPED_WRAPS_NOTHING) wrapper.setAttribute(FLOAT_SHADOW_SPEC_ATTR, JSON.stringify(shadow));
  else wrapper.removeAttribute(FLOAT_SHADOW_SPEC_ATTR);
  if (bothSides || inMargin || shadowed || inRun) {
    if (bothSides || inRun) wrapper.setAttribute(FLOAT_BOTH_SIDES_ATTR, "true");
    else wrapper.removeAttribute(FLOAT_BOTH_SIDES_ATTR);
    wrapper.style.float = "none";
    wrapper.style.margin = "0";
    wrapper.style.shapeOutside = "";
    wrapper.style.position = "absolute";
    const parent = wrapper.offsetParent instanceof HTMLElement ? wrapper.offsetParent : sheet;
    const scale = paginationLayoutScale(wrapper);
    const parentRect = parent.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    wrapper.style.left = `${placement.leftPx - ((parentRect.left - sheetRect.left) / (scale.x || 1) + parent.clientLeft)}px`;
    wrapper.style.top = `${placement.topPx - ((parentRect.top - sheetRect.top) / (scale.y || 1) + parent.clientTop)}px`;
    return;
  }
  if (wrapper.getAttribute(FLOAT_BOTH_SIDES_ATTR) === "true" || wrapper.style.position === "absolute") {
    wrapper.removeAttribute(FLOAT_BOTH_SIDES_ATTR);
    wrapper.style.position = "";
    wrapper.style.left = "";
    wrapper.style.top = "";
  }
  const side = floatSide(anchor, placement, geometry);
  const dropPx = steadyDropPx(wrapTopMarginPx(placement.topPx, originPx.topPx, distances.topPx), appliedDropPx(wrapper));
  wrapper.style.float = side;
  // A float cannot start above its own place in the flow, but it can start
  // lower: a shape 0.3" below its paragraph's top leaves the lines above it
  // full width, as Word draws it.
  wrapper.style.marginTop = `${dropPx}px`;
  wrapper.style.marginBottom = `${distances.bottomPx}px`;
  // In a single-column section the float's margin carries the shape's
  // horizontal offset exactly. A multi-column sheet cannot say which column
  // box a float starts from without measuring the float itself, which would
  // feed back on the margin this sets; the shape floats flush there.
  const columns = Number.parseInt(getComputedStyle(sheet).columnCount, 10);
  const single = !(columns > 1);
  const contentRight = geometry.pageWidthPx - geometry.marginRightPx;
  if (side === "left") {
    // Negative into the page margin where Word draws it there.
    wrapper.style.marginLeft = `${single ? placement.leftPx - geometry.marginLeftPx : 0}px`;
    wrapper.style.marginRight = `${distances.rightPx}px`;
  } else {
    wrapper.style.marginRight = `${single ? contentRight - placement.leftPx - placement.widthPx : 0}px`;
    wrapper.style.marginLeft = `${distances.leftPx}px`;
  }
  const shape = floatWrapShapeOutside(anchor.wrap);
  wrapper.style.shapeOutside = shape ?? (single ? squareFloatDropShape(Number.parseFloat(wrapper.style.marginTop) || 0, distances.topPx) : "");
  wrapper.style.shapeMargin = shape ? `${Math.max(distances.leftPx, distances.rightPx)}px` : "";
}

function applyPlacement(
  wrapper: HTMLElement,
  frame: HTMLElement,
  anchor: FloatAnchor,
  geometry: FloatPageGeometry,
  stack: readonly number[],
  flowTopPx: number,
  originPx: { leftPx: number; topPx: number },
  shadow: FloatShadowSpec | typeof DROPPED_WRAPS_NOTHING | null = null,
): void {
  const placement = placeFloatOnPage(anchor, {
    ...geometry,
    // Paragraph/line origins measure from the anchor's own flow position; the
    // wrapper sits exactly where the anchor paragraph does.
    flowTopPx,
  });
  publishFloatPageRoom(wrapper, anchor, { ...geometry, flowTopPx });
  const distances = floatWrapDistancesPx(anchor);
  // A wrapped frame wholly in the top or bottom margin wraps no line: it is
  // drawn where Word puts it and takes no room from the body.
  // A top-and-bottom box placed from the page well below its paragraph, on
  // a page of stacked column regions, is drawn at its page point out of the
  // flow: the regions are laid out block by block, and as a block at its
  // paragraph the band pushed everything after it down by its whole drop
  // (corpus R94-D21: a footnote block at 708pt anchored under the title sent
  // the body to page 2, 5 pages for Word's 3). The band itself covers lines
  // Word would wrap under it, which is the lesser error.
  const vertical = (anchor as { vertical?: { relativeFrom?: unknown } }).vertical;
  const pageBandInRegions =
    floatFlowMode(anchor) === "band" &&
    ["page", "margin", "topMargin", "bottomMargin"].includes(String(vertical?.relativeFrom ?? "")) &&
    placement.topPx - originPx.topPx > BAND_AT_PAGE_PLACE_MIN_DROP_PX &&
    Boolean(wrapper.closest("article[data-page-sheet]")?.hasAttribute(COLUMN_REGIONS_ATTR));
  const mode = pageBandInRegions ||
    (floatFlowMode(anchor) !== "overlay" &&
      floatWhollyInPageMargin(
        placement,
        distances,
        // A cell's own side paddings are no page margin.
        wrapper.closest("td, th")
          ? { pageHeightPx: geometry.pageHeightPx, marginTopPx: geometry.marginTopPx, marginBottomPx: geometry.marginBottomPx }
          : geometry,
      ))
    ? "overlay"
    : floatFlowMode(anchor);
  // Drawn out of the flow, the band still keeps text off the column it
  // stands at the foot of: the region flow ends that column above it
  // (`bandedColumnFeet`), as Word wraps the column's text above the box.
  const bandToken = pageBandInRegions
    ? [
        placement.topPx - distances.topPx - geometry.marginTopPx,
        placement.topPx + placement.heightPx + distances.bottomPx - geometry.marginTopPx,
        placement.leftPx - distances.leftPx - geometry.marginLeftPx,
        placement.leftPx + placement.widthPx + distances.rightPx - geometry.marginLeftPx,
      ].map((value) => Math.round(value * 100) / 100).join(",")
    : null;
  if (bandToken === null) wrapper.removeAttribute(COLUMN_BAND_EXCLUSION_ATTR);
  else if (wrapper.getAttribute(COLUMN_BAND_EXCLUSION_ATTR) !== bandToken) wrapper.setAttribute(COLUMN_BAND_EXCLUSION_ATTR, bandToken);
  const zIndex = floatStackZIndex(anchor, stack);
  // Text on both sides of the box (`wrapText="bothSides"` with room for words
  // on each side), as a picture has it: no CSS float does that, so the box
  // leaves the flow at its page point and `floatBothSidesWrap` carries each
  // crossing line past it. A box centred in its column (corpus R12-D12) had
  // floated to the left margin.
  const sheet = wrapper.closest<HTMLElement>("article[data-page-sheet]");
  const bothSides =
    mode === "float" &&
    sheet !== null &&
    (anchor.wrap.text ?? "bothSides") === "bothSides" &&
    !(Number.parseInt(getComputedStyle(sheet).columnCount, 10) > 1) &&
    !wrapper.closest("td, th") &&
    !wrapper.hasAttribute("data-frame-chain") &&
    placement.leftPx - distances.leftPx - geometry.marginLeftPx >= FLOAT_BOTH_SIDES_MIN_STRIP_PX &&
    geometry.pageWidthPx - geometry.marginRightPx - (placement.leftPx + placement.widthPx + distances.rightPx) >=
      FLOAT_BOTH_SIDES_MIN_STRIP_PX;

  const shadowed = mode === "float" && !bothSides && shadow !== null;
  if (shadowed && shadow !== DROPPED_WRAPS_NOTHING) wrapper.setAttribute(FLOAT_SHADOW_SPEC_ATTR, JSON.stringify(shadow));
  else wrapper.removeAttribute(FLOAT_SHADOW_SPEC_ATTR);
  wrapper.dataset.floatMode = bothSides || shadowed ? "overlay" : mode;
  frame.style.width = `${placement.widthPx}px`;
  frame.style.height = `${placement.heightPx}px`;
  frame.style.zIndex = String(zIndex);
  frame.style.transform = anchor.rotation
    ? `rotate(${anchor.rotation / 60000}deg)`
    : "";

  const body = normalizeFloatFrameBody(parseJson(wrapper, "data-frame-body"));
  frame.style.paddingLeft = `${emuToPx(body.insetLEmu)}px`;
  frame.style.paddingTop = `${emuToPx(body.insetTEmu)}px`;
  frame.style.paddingRight = `${emuToPx(body.insetREmu)}px`;
  frame.style.paddingBottom = `${emuToPx(body.insetBEmu)}px`;
  frame.style.justifyContent =
    body.anchor === "ctr" ? "center" : body.anchor === "b" ? "flex-end" : "flex-start";
  // A box whose words do not wrap (`wrap="none"`, VML `mso-wrap-style:none`)
  // is as wide as its longest line, whatever width it states, and a box that
  // resizes to its text (`spAutoFit`, `mso-fit-shape-to-text:t`) as tall as
  // its words. Measured in Word 16 for Mac: a 212 pt form field holding
  // "MRAI QA" drew 47 pt wide, at its stated height; with
  // `mso-wrap-style:square` it drew 212 pt; with fit-to-text it hugged the
  // line both ways. A floating DrawingML box with `wrap="none"` drew the same.
  // Only an overlay frame, which no body text wraps around: a float's wrap
  // margins are computed from the stated width. A linked chain keeps its
  // boxes (its overflow is the next box's content) and so does WordArt.
  const sizesToText = (mode === "overlay" || bothSides) && !wrapper.hasAttribute("data-frame-chain") &&
    !body.warp && body.vert === "horz";
  if (sizesToText && body.wrap === "none") frame.style.width = "max-content";
  if (sizesToText && body.autofit === "shape") frame.style.height = "auto";
  // "Wrap text in shape" off (`bodyPr wrap="none"`, VML `mso-wrap-style:none`):
  // a line runs past the frame's width as Word draws it, never broken in it.
  frame.style.whiteSpace = body.wrap === "none" ? "pre" : "";

  if (bothSides && sheet) {
    // Out of the flow at its page point, the wrapper as big as the box: the
    // both-sides pass reads the obstacle from the wrapper's own box.
    wrapper.style.cssText = "";
    wrapper.setAttribute(FLOAT_BOTH_SIDES_ATTR, "true");
    wrapper.style.position = "absolute";
    wrapper.style.margin = "0";
    const parent = wrapper.offsetParent instanceof HTMLElement ? wrapper.offsetParent : sheet;
    const scale = paginationLayoutScale(wrapper);
    const parentRect = parent.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    wrapper.style.left = `${placement.leftPx - ((parentRect.left - sheetRect.left) / (scale.x || 1) + parent.clientLeft)}px`;
    wrapper.style.top = `${placement.topPx - ((parentRect.top - sheetRect.top) / (scale.y || 1) + parent.clientTop)}px`;
    frame.style.position = "relative";
    frame.style.left = "";
    frame.style.top = "";
    frame.style.float = "";
    frame.style.shapeOutside = "";
    frame.style.margin = "";
    return;
  }
  if (wrapper.getAttribute(FLOAT_BOTH_SIDES_ATTR) === "true") {
    wrapper.removeAttribute(FLOAT_BOTH_SIDES_ATTR);
    wrapper.style.position = "";
    wrapper.style.left = "";
    wrapper.style.top = "";
  }

  if (mode === "overlay" || shadowed) {
    // Out of flow entirely. The wrapper keeps zero height — so the
    // paginator's block measurement and the sheet's body-extent probe both
    // skip it — and becomes the frame's containing block, so the offset below
    // is measured, never assumed. `position: absolute` otherwise resolves
    // against whichever ancestor happens to be positioned, and the live
    // editor answers with the sheet's BORDER edge rather than its padding
    // edge: every frame then lands one page margin off.
    // Written only when it is not that already: cleared and set back on
    // every pass, the cover's text box marked its sheet changed each time
    // (the page ledger then laid the book out from its first page, every
    // background step).
    if (wrapper.style.length !== 1 || wrapper.style.position !== "relative") {
      wrapper.style.cssText = "";
      wrapper.style.position = "relative";
    }
    frame.style.position = "absolute";
    frame.style.left = `${placement.leftPx - originPx.leftPx}px`;
    frame.style.top = `${placement.topPx - originPx.topPx}px`;
    frame.style.float = "";
    frame.style.shapeOutside = "";
    frame.style.margin = "";
    return;
  }

  frame.style.position = "relative";
  frame.style.left = "";
  frame.style.top = "";

  if (mode === "band") {
    // A band placed from the page or a margin well below where its paragraph
    // stands is a band across the page at that place, not a block at its
    // paragraph: Word goes on setting the text after the paragraph above it
    // and carries the lines that reach it below it (corpus R94-D21: a
    // footnote-like box at 708pt anchored under the title; drawn as a block
    // 873 px below the title, it sent the whole body to page 2, 5 pages for
    // Word's 3). A float as wide as the column, its top kept free by its
    // shape, does that: the lines above the band keep the full width.
    const dropPx = steadyDropPx(wrapTopMarginPx(placement.topPx, originPx.topPx, distances.topPx), appliedDropPx(wrapper));
    const vertical = (anchor as { vertical?: { relativeFrom?: unknown } }).vertical;
    const pagePlaced = ["page", "margin", "topMargin", "bottomMargin"].includes(String(vertical?.relativeFrom ?? ""));
    const singleColumn = !(sheet && Number.parseInt(getComputedStyle(sheet).columnCount, 10) > 1);
    if (pagePlaced && singleColumn && dropPx > BAND_AT_PAGE_PLACE_MIN_DROP_PX) {
      const contentRight = geometry.pageWidthPx - geometry.marginRightPx;
      wrapper.style.float = "left";
      wrapper.style.clear = "";
      wrapper.style.marginTop = `${dropPx}px`;
      wrapper.style.marginBottom = `${distances.bottomPx}px`;
      wrapper.style.marginLeft = `${placement.leftPx - geometry.marginLeftPx}px`;
      wrapper.style.marginRight = `${Math.max(0, contentRight - placement.leftPx - placement.widthPx)}px`;
      wrapper.style.shapeOutside = `inset(${Math.max(0, dropPx - distances.topPx)}px 0px 0px)`;
      wrapper.style.shapeMargin = "";
      frame.style.shapeOutside = "";
      return;
    }
    // Word's "Top and Bottom": no text beside the frame at all. The wrapper is
    // an ordinary full-width block, so the paginator charges it its height the
    // way it charges any block.
    wrapper.style.float = "";
    wrapper.style.shapeOutside = "";
    wrapper.style.clear = "both";
    // How far below its paragraph's top Word puts the box, for a run of
    // bands laid out whole (layoutMixedBandRuns).
    const fromParagraph = ["paragraph", "line"].includes(String(vertical?.relativeFrom ?? ""));
    const bandDrop = fromParagraph ? (Math.round((placement.topPx - flowTopPx) * 64) / 64).toString() : null;
    if (bandDrop === null) delete wrapper.dataset.bandDrop;
    else if (wrapper.dataset.bandDrop !== bandDrop) wrapper.dataset.bandDrop = bandDrop;
    // A run laid out whole sets these margins itself.
    const run = mixedBandRunsOn() ? wrapper.getAttribute(BAND_RUN_ATTR) : null;
    // From its paragraph's top, as a picture band is (a box 0.4" below its
    // paragraph was drawn at the paragraph's first line).
    if (run !== "member") wrapper.style.marginTop = `${dropPx}px`;
    if (run === null) wrapper.style.marginBottom = `${distances.bottomPx}px`;
    wrapper.style.marginLeft = `${steadyBandLeftPx(wrapper, Math.max(0, placement.leftPx - originPx.leftPx))}px`;
    frame.style.shapeOutside = "";
    return;
  }

  // Square / tight / through: a real CSS float, so the browser does the
  // re-wrapping and every block after it measures its true wrapped height.
  // The box at its page point, as a picture or a shape float is: offset
  // across by its margin on the float side (negative into the page margin)
  // and dropped below its flow place. Floated flush instead, a box centred
  // in the right margin was drawn at the text's right edge and one placed
  // 0.4" below its paragraph at the paragraph's first line.
  const side = floatSide(anchor, placement, geometry);
  const single = !(sheet && Number.parseInt(getComputedStyle(sheet).columnCount, 10) > 1);
  const contentRight = geometry.pageWidthPx - geometry.marginRightPx;
  const dropPx = steadyDropPx(wrapTopMarginPx(placement.topPx, originPx.topPx, distances.topPx), appliedDropPx(wrapper));
  wrapper.style.float = side;
  wrapper.style.clear = "";
  wrapper.style.marginTop = `${dropPx}px`;
  wrapper.style.marginBottom = `${distances.bottomPx}px`;
  wrapper.style.marginLeft = `${side === "right" ? distances.leftPx : single ? placement.leftPx - geometry.marginLeftPx : 0}px`;
  wrapper.style.marginRight = `${side === "left" ? distances.rightPx : single ? contentRight - placement.leftPx - placement.widthPx : 0}px`;
  const shape = floatWrapShapeOutside(anchor.wrap);
  wrapper.style.shapeOutside = shape ?? (single ? squareFloatDropShape(dropPx, distances.topPx) : "");
  wrapper.style.shapeMargin = shape ? `${Math.max(distances.leftPx, distances.rightPx)}px` : "";
}

interface ChainFrame {
  pos: number;
  node: ProseMirrorNode;
  element: HTMLElement;
  sequence: number;
}

/** How much taller the frame's content is than the frame can show. */
function chainOverflowPx(element: HTMLElement): number {
  const frame = element.querySelector<HTMLElement>(":scope > [data-text-box-frame]");
  if (!frame) return 0;
  return frame.scrollHeight - frame.clientHeight;
}

/**
 * Move one block from an overfull frame to the next frame in its chain, or
 * pull one back when the next frame's first block fits again.
 *
 * Only whole blocks move: a paragraph is never split, so a source anchor is
 * never divided between two frames and a save still routes every word to the
 * `…/txbx[i]/p[j]` it came from. Returns `null` when the chain already shows
 * what it can.
 */
function planChainMove(
  view: EditorView,
  frames: ChainFrame[],
): { from: number; size: number; to: number } | null {
  for (let index = 0; index < frames.length - 1; index += 1) {
    const current = frames[index];
    const next = frames[index + 1];
    const overflow = chainOverflowPx(current.element);
    if (overflow > CHAIN_FIT_TOLERANCE_PX && current.node.childCount > 1) {
      const lastChild = current.node.child(current.node.childCount - 1);
      // A last block whose first line still fits stays: Word breaks a linked
      // box's story at a LINE, so its other lines continue at the top of the
      // next box (`layoutChainContinuations`), not the whole paragraph.
      const lastElement = view.nodeDOM(current.pos + 1 + current.node.content.size - lastChild.nodeSize);
      const frame = current.element.querySelector<HTMLElement>(":scope > [data-text-box-frame]");
      if (lastElement instanceof HTMLElement && frame && chainLinesShown(lastElement, frame) > 0) continue;
      return {
        from: current.pos + 1 + current.node.content.size - lastChild.nodeSize,
        size: lastChild.nodeSize,
        to: next.pos + 1,
      };
    }
    if (overflow < -CHAIN_FIT_TOLERANCE_PX && next.node.childCount > 0) {
      // Room reappeared (text was deleted, or the frame grew): take the next
      // frame's first block back so the chain never leaves a gap in the
      // middle of its own story.
      const firstElement = view.nodeDOM(next.pos + 1);
      const height =
        firstElement instanceof HTMLElement ? firstElement.offsetHeight : Number.POSITIVE_INFINITY;
      // Strictly smaller than the room, not merely equal: an exactly-fitting
      // pull-back measured a hair differently on the way back would be pushed
      // out again on the next pass, and the chain would oscillate forever.
      if (height <= -overflow - CHAIN_FIT_TOLERANCE_PX) {
        return {
          from: next.pos + 1,
          size: next.node.child(0).nodeSize,
          to: current.pos + 1 + current.node.content.size,
        };
      }
    }
  }
  return null;
}

/** Linked text box stories (`frameChain.storyId`) within a node, in document
 * order (a story once per box), not looking inside a text box. Memoized by
 * node: ProseMirror keeps an untouched node across transactions, so a key
 * typed walks only the blocks it changed. Both chain passes walked every node
 * of the document after every transaction to find none (the 296-page book:
 * ~10 ms a key, dev). */
const chainStoriesMemo = new WeakMap<ProseMirrorNode, readonly number[]>();
const NO_CHAIN_STORIES: readonly number[] = [];
function chainStoriesWithin(node: ProseMirrorNode): readonly number[] {
  if (node.type.name === TEXT_BOX_NODE_NAME) {
    const chain = normalizeFloatFrameChain(node.attrs?.frameChain);
    return chain ? [chain.storyId] : NO_CHAIN_STORIES;
  }
  if (node.childCount === 0) return NO_CHAIN_STORIES;
  const known = chainStoriesMemo.get(node);
  if (known) return known;
  let stories: number[] | null = null;
  node.forEach((child) => {
    const within = chainStoriesWithin(child);
    if (within.length) (stories ??= []).push(...within);
  });
  const result = stories ?? NO_CHAIN_STORIES;
  chainStoriesMemo.set(node, result);
  return result;
}

function reflowChains(view: EditorView): boolean {
  const stories = new Set(chainStoriesWithin(view.state.doc));
  let moved = false;
  for (const storyId of stories) {
    for (let attempt = 0; attempt < MAX_CHAIN_MOVES_PER_PASS; attempt += 1) {
      const frames = collectChain(view, storyId);
      if (!frames) break;
      const plan = planChainMove(view, frames);
      if (!plan || plan.size <= 0) break;
      const { state } = view;
      const slice = state.doc.slice(plan.from, plan.from + plan.size);
      if (slice.content.size === 0) break;
      const tr = state.tr
        .delete(plan.from, plan.from + plan.size)
        .setMeta(FLOATING_TEXT_BOX_META, true)
        .setMeta("addToHistory", false);
      tr.insert(tr.mapping.map(plan.to), slice.content);
      view.dispatch(tr);
      moved = true;
    }
  }
  return moved;
}

/** Re-read the chain's frames from the CURRENT document after a move. */
function collectChain(view: EditorView, storyId: number): ChainFrame[] | null {
  const frames: ChainFrame[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== TEXT_BOX_NODE_NAME) return true;
    const chain = normalizeFloatFrameChain(node.attrs?.frameChain);
    if (!chain || chain.storyId !== storyId) return false;
    const element = view.nodeDOM(pos);
    if (!(element instanceof HTMLElement)) return false;
    frames.push({ pos, node, element, sequence: chain.sequence });
    return false;
  });
  if (frames.length < 2) return null;
  frames.sort((a, b) => a.sequence - b.sequence || a.pos - b.pos);
  return frames;
}

const CHAIN_CONTINUATION_ATTR = "data-chain-continuation";

/** The lines an element's words are set on, as client-px bands, top first.
 * Text that is only spaces sets no line (a space run may be drawn as a zero
 * line box whose glyph box still reaches below it: `documentAutoLineSpacing`),
 * and two boxes are one line when they overlap by half the smaller one. */
function chainLineBands(element: HTMLElement): Array<{ top: number; bottom: number }> {
  const doc = element.ownerDocument;
  const range = doc.createRange();
  const rects: DOMRect[] = [];
  const walker = doc.createTreeWalker(element, 4 /* SHOW_TEXT */);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (!/\S/.test(text.data)) continue;
    range.selectNodeContents(text);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }
  }
  // Pictures and other atoms of the line are lines too.
  for (const atom of Array.from(element.querySelectorAll<HTMLElement>("img, svg, [data-inline-atom]"))) {
    const rect = atom.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) rects.push(rect);
  }
  rects.sort((a, b) => a.top - b.top);
  const bands: Array<{ top: number; bottom: number }> = [];
  for (const rect of rects) {
    const last = bands[bands.length - 1];
    const overlap = last ? Math.min(last.bottom, rect.bottom) - Math.max(last.top, rect.top) : 0;
    if (last && overlap > Math.min(last.bottom - last.top, rect.height) / 2) {
      last.top = Math.min(last.top, rect.top);
      last.bottom = Math.max(last.bottom, rect.bottom);
    } else {
      bands.push({ top: rect.top, bottom: rect.bottom });
    }
  }
  if (!bands.length) {
    const box = element.getBoundingClientRect();
    bands.push({ top: box.top, bottom: box.bottom });
  }
  return bands;
}

/** The bottom of a frame's text area (inside its border and inset), client px. */
function chainTextBottom(frame: HTMLElement): number {
  const style = getComputedStyle(frame);
  const scale = paginationLayoutScale(frame).y || 1;
  return (
    frame.getBoundingClientRect().bottom -
    ((Number.parseFloat(style.borderBottomWidth) || 0) + (Number.parseFloat(style.paddingBottom) || 0)) * scale
  );
}

/** How many of an element's lines lie wholly inside the frame's text area. */
function chainLinesShown(element: HTMLElement, frame: HTMLElement): number {
  const bottom = chainTextBottom(frame) + CHAIN_FIT_TOLERANCE_PX;
  const bands = chainLineBands(element);
  let shown = 0;
  while (shown < bands.length && bands[shown].bottom <= bottom) shown += 1;
  return shown;
}

function clearChainCut(frame: HTMLElement): void {
  frame.removeAttribute("data-chain-cut");
  frame.style.removeProperty("--chain-cut-bottom");
}

function clearChainContinuation(wrapper: HTMLElement, frame: HTMLElement): void {
  wrapper.querySelector(`:scope > [${CHAIN_CONTINUATION_ATTR}]`)?.remove();
  frame.removeAttribute("data-chain-continued");
  frame.style.removeProperty("--chain-continued-height");
}

/**
 * Word breaks a linked chain's story at a LINE: the paragraph that reaches
 * the bottom of one box keeps the lines that fit, and its other lines open the
 * next box (Word 16.86, corpus R28-D09). The editor keeps the paragraph whole
 * in the box that shows its first line (a save routes every word to the
 * `…/txbx[i]/p[j]` it came from), hides the lines that do not fit there, and
 * paints them at the top of the next box from a non-editable copy of the
 * paragraph set at that box's width. The copy's height is reserved in the
 * next box (`::before`), so the blocks that box really holds start below it
 * and the chain pass measures that box's overflow with the continuation in
 * it. A paragraph long enough to cross several boxes continues box by box.
 *
 * Returns whether any reservation changed, so the caller can let the chain
 * pass hand on what the reservation pushed out.
 */
function layoutChainContinuations(view: EditorView): boolean {
  const stories = new Set(chainStoriesWithin(view.state.doc));
  let changed = false;
  for (const storyId of stories) {
    const frames = collectChain(view, storyId);
    if (!frames) continue;
    let carry: { element: HTMLElement; skip: number } | null = null;
    frames.forEach((chainFrame, index) => {
      const wrapper = chainFrame.element;
      const frame = wrapper.querySelector<HTMLElement>(":scope > [data-text-box-frame]");
      if (!frame) return;
      const before = frame.style.getPropertyValue("--chain-continued-height");
      const scale = paginationLayoutScale(frame).y || 1;
      clearChainContinuation(wrapper, frame);
      clearChainCut(frame);
      if (carry) {
        const style = getComputedStyle(frame);
        const box = frame.getBoundingClientRect();
        const insetLeft = (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.paddingLeft) || 0);
        const insetTop = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.paddingTop) || 0);
        const insetRight = (Number.parseFloat(style.borderRightWidth) || 0) + (Number.parseFloat(style.paddingRight) || 0);
        const overlay = document.createElement("div");
        overlay.setAttribute(CHAIN_CONTINUATION_ATTR, "");
        overlay.setAttribute("aria-hidden", "true");
        overlay.className = frame.className;
        overlay.style.cssText =
          "position:absolute;display:block;margin:0;padding:0;border:0;background:transparent;overflow:hidden;pointer-events:none;outline:0;";
        overlay.style.width = `${Math.max(0, box.width / scale - insetLeft - insetRight)}px`;
        const copy = carry.element.cloneNode(true) as HTMLElement;
        for (const node of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>("*"))]) {
          node.removeAttribute("id");
          node.removeAttribute("data-block-id");
          node.removeAttribute("contenteditable");
        }
        copy.style.marginTop = "0";
        overlay.appendChild(copy);
        wrapper.appendChild(overlay);
        const parent = (overlay.offsetParent as HTMLElement | null) ?? wrapper;
        const parentBox = parent.getBoundingClientRect();
        overlay.style.left = `${(box.left - parentBox.left) / scale - parent.clientLeft + insetLeft}px`;
        overlay.style.top = `${(box.top - parentBox.top) / scale - parent.clientTop + insetTop}px`;
        const bands = chainLineBands(copy);
        const skip = Math.min(carry.skip, bands.length - 1);
        // Measured before the copy is shifted up to its first continued line.
        const copyBox = copy.getBoundingClientRect();
        const cut = (bands[skip].top - copyBox.top) / scale;
        copy.style.marginTop = `${-cut}px`;
        const room = chainTextBottom(frame) - (box.top + insetTop * scale);
        let fit = skip;
        while (fit < bands.length && bands[fit].bottom - bands[skip].top <= room + CHAIN_FIT_TOLERANCE_PX) fit += 1;
        let height: number;
        if (fit < bands.length && index < frames.length - 1) {
          height = (bands[fit].top - bands[skip].top) / scale;
          carry = { element: carry.element, skip: fit };
        } else {
          height = (copyBox.bottom - bands[skip].top) / scale;
          carry = null;
        }
        overlay.style.height = `${Math.max(0, height)}px`;
        frame.setAttribute("data-chain-continued", "");
        frame.style.setProperty("--chain-continued-height", `${Math.max(0, height)}px`);
      }
      if (before !== frame.style.getPropertyValue("--chain-continued-height")) changed = true;
      if (carry || index === frames.length - 1) return;
      const last = frame.lastElementChild;
      if (!(last instanceof HTMLElement)) return;
      const bands = chainLineBands(last);
      const shown = chainLinesShown(last, frame);
      if (shown >= bands.length) return;
      const box = last.getBoundingClientRect();
      const cutTop = shown > 0 ? bands[shown].top : box.top;
      frame.setAttribute("data-chain-cut", "");
      frame.style.setProperty("--chain-cut-bottom", `${Math.max(0, (box.bottom - cutTop) / scale)}px`);
      carry = { element: last, skip: shown };
    });
  }
  return changed;
}

// ---------------------------------------------------------------------------
// The frame's element, owned by MRAI rather than rebuilt by ProseMirror.
// ---------------------------------------------------------------------------

/**
 * A node view for the anchored text box.
 *
 * ProseMirror rebuilds a node's DOM from `renderHTML` whenever the node is
 * redrawn, which pagination does constantly — so geometry written onto that
 * element imperatively is wiped within a frame. The symptom is subtle and was
 * exactly what happened here: the attributes `renderHTML` emits (and the CSS
 * that rides them) survive every redraw, so the box correctly left the flow
 * and the page count came out right, while `position`/`left`/`top` never
 * stuck and the words painted at the body's left margin.
 *
 * A node view owns its element: ProseMirror calls `update()` instead of
 * rebuilding, and `ignoreMutation` keeps our own attribute writes from looking
 * like user edits. This is how `documentShapeExtension` holds a floating shape.
 */
/** Harness switch (`window.__docsInlineFitShrinkOff = true`): an in-line
 * box that resizes to its text keeps its stated height as a floor (as
 * before; an A/B of one build). */
function inlineFitShrinkOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsInlineFitShrinkOff?: boolean }).__docsInlineFitShrinkOff === true;
}

class FloatingTextBoxView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: ProseMirrorNode;
  /** Word's Insert > WordArt: the frame's words painted bent. */
  private warp: { key: string; dispose: () => void } | null = null;
  /** The border, grips and selection frame of an anchored box. */
  private readonly chrome: TextBoxFrameChromeView;

  constructor(props: NodeViewRendererProps) {
    this.node = props.node;
    this.dom = document.createElement("div");
    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "mrnote-text-box__frame";
    this.contentDOM.setAttribute("data-text-box-frame", "");
    this.dom.appendChild(this.contentDOM);
    this.chrome = new TextBoxFrameChromeView({
      getView: () => props.editor.view,
      getPos: () => {
        const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
        return typeof pos === "number" ? pos : undefined;
      },
      wrapper: this.dom,
      frame: this.contentDOM,
    });
    this.dom.appendChild(this.chrome.element);
    chromes.set(this.dom, this.chrome);
    // Everything `renderHTML` would have produced, including the global
    // `data-block-id`, so nothing that reads the frame from the DOM can tell
    // the difference.
    for (const [key, value] of Object.entries(props.HTMLAttributes ?? {})) {
      if (value === null || value === undefined) continue;
      this.dom.setAttribute(key, String(value));
    }
    this.dom.setAttribute("data-text-box", "");
    this.dom.classList.add("mrnote-text-box");
    this.syncOwnAttributes();
  }

  /** The attributes this view is authoritative for, re-read from the node. */
  private syncOwnAttributes(): void {
    const attrs = this.node.attrs ?? {};
    const blockId = attrs.block_id;
    if (typeof blockId === "string" && blockId) this.dom.setAttribute("data-block-id", blockId);
    const anchor = normalizeFloatAnchor(attrs.floatAnchor);
    if (anchor) {
      this.dom.setAttribute("data-float-anchor", JSON.stringify(anchor));
      // Only SEED the mode: the layout pass owns it from here, and resetting
      // it on every update would fight that pass for the flow decision.
      if (!this.dom.dataset.floatMode) this.dom.dataset.floatMode = floatFlowMode(anchor);
    } else {
      this.dom.removeAttribute("data-float-anchor");
      this.dom.removeAttribute("data-float-mode");
    }
    // The frame's own paint and, for an IN-LINE frame, its own size. The
    // layout pass never touches a frame with no `data-float-anchor` (it
    // `continue`s past one), so these are this view's to keep in sync; an
    // anchored frame's geometry stays the layout pass's alone.
    // An ANCHORED frame's paint belongs on the frame itself. Its wrapper is a
    // zero-height containing block the layout pass resets (`cssText = ""`),
    // so a border or a fill left there was never drawn: every floating Word
    // text box showed its words with no line and no fill around them.
    const painted = anchor ? this.contentDOM : this.dom;
    const bare = anchor ? this.dom : this.contentDOM;
    bare.style.background = "";
    bare.style.border = "";
    const fill = normalizeDocumentTextBoxFill(attrs.textBoxFill);
    const fillCss = fill ? documentTextBoxFillCss(fill) : null;
    if (fill && fillCss) {
      this.dom.setAttribute("data-text-box-fill", JSON.stringify(fill));
      painted.style.background = fillCss;
    } else {
      this.dom.removeAttribute("data-text-box-fill");
      painted.style.background = "";
    }
    const outline = documentTextBoxOutlineHtmlAttributes(attrs.textBoxOutline);
    const border = /(?:^|;)border:([^;]+)/.exec(outline.style ?? "")?.[1] ?? "";
    if (outline["data-text-box-outline"]) {
      this.dom.setAttribute("data-text-box-outline", outline["data-text-box-outline"]);
    } else {
      this.dom.removeAttribute("data-text-box-outline");
    }
    painted.style.border = border;
    painted.style.boxSizing = border ? "border-box" : "";
    // Its outer shadow, on the painted box (corpus R21-D04).
    const shadow = documentTextBoxShadowHtmlAttributes(attrs.textBoxShadow);
    bare.style.boxShadow = "";
    painted.style.boxShadow = /(?:^|;)box-shadow:([^;]+)/.exec(shadow.style ?? "")?.[1] ?? "";
    if (shadow["data-text-box-shadow"]) this.dom.setAttribute("data-text-box-shadow", shadow["data-text-box-shadow"]);
    else this.dom.removeAttribute("data-text-box-shadow");
    const extent = anchor
      ? null
      : normalizeDocumentTextBoxFrameExtent(attrs.frameExtent);
    if (extent) {
      this.dom.setAttribute("data-frame-extent", JSON.stringify(extent));
      this.dom.style.width = `${Number(emuToPx(extent.widthEmu).toFixed(3))}px`;
      // The stated height is the box's, whatever it holds, unless it resizes to
      // its text (`a:spAutoFit`). Word 16 for Mac, 20 lines in a 71 pt box: with
      // `a:noAutofit` or nothing stated the next paragraph stands 71 pt on and the
      // words past the foot are clipped; with `a:spAutoFit` the box holds them all.
      // R283-D06's six 136 pt boxes stood 195 pt here, a page each by the end.
      // One that resizes to its text is as tall as its words, shorter than
      // its stated height too: that is the height Word last fitted it to,
      // and Word fits it again (Windows Word, corpus R485-D45: answer boxes
      // saved 95.3 and 92.6 pt tall drew 89.8 and 83.7 pt, their insets and
      // paragraphs; held at the saved height, each stood 5-9 pt taller and
      // the last page ran onto another).
      // A box with no body read (this editor's own) keeps the floor it had.
      const heightPx = `${Number(emuToPx(extent.heightEmu).toFixed(3))}px`;
      const body = attrs.frameBody && typeof attrs.frameBody === "object" ? normalizeFloatFrameBody(attrs.frameBody) : null;
      const fixed = body !== null && body.autofit !== "shape";
      const fitted = body !== null && body.autofit === "shape" && !inlineFitShrinkOff();
      this.dom.style.minHeight = fixed || fitted ? "" : heightPx;
      this.dom.style.height = fixed ? heightPx : "";
      this.contentDOM.style.height = fixed ? "100%" : "";
      this.contentDOM.style.overflow = fixed ? "hidden" : "";
    } else if (!anchor) {
      this.dom.removeAttribute("data-frame-extent");
      this.dom.style.width = "";
      this.dom.style.minHeight = "";
      this.dom.style.height = "";
      this.contentDOM.style.height = "";
      this.contentDOM.style.overflow = "";
    }
    for (const [key, value] of [
      ["data-frame-body", attrs.frameBody],
      ["data-frame-chain", attrs.frameChain],
    ] as const) {
      if (value && typeof value === "object") this.dom.setAttribute(key, JSON.stringify(value));
      else this.dom.removeAttribute(key);
    }
    // Words that never wrap (`bodyPr/@wrap="none"`), drawn by the frame's CSS.
    if (normalizeFloatFrameBody(attrs.frameBody).wrap === "none") this.dom.dataset.frameNoWrap = "";
    else delete this.dom.dataset.frameNoWrap;
    // The words' direction (`bodyPr/@vert`), drawn by the frame's CSS.
    const vert = normalizeFloatFrameBody(attrs.frameBody).vert;
    if (vert === "horz") delete this.dom.dataset.frameVert;
    else this.dom.dataset.frameVert = vert;
    if (typeof attrs.frameName === "string" && attrs.frameName) {
      this.dom.setAttribute("data-frame-name", attrs.frameName.slice(0, 255));
    } else {
      this.dom.removeAttribute("data-frame-name");
    }
    // The paragraph the frame is anchored in: a `paragraph`/`line` origin is
    // measured from ITS top, not from wherever the frame's node sits.
    const host = floatHostParagraphAnchor(attrs.source);
    if (host) this.dom.dataset.floatHostAnchor = host;
    else delete this.dom.dataset.floatHostAnchor;
    this.syncWarp(attrs.frameBody);
  }

  /**
   * Word's WordArt is a text box whose `bodyPr` bends its words
   * (`frameBody.warp`). The words stay real, editable paragraphs; the shared
   * painter draws them bent over the frame (their own glyph fill gives way,
   * so the frame's line, fill and caret stay where they are).
   */
  private syncWarp(frameBody: unknown): void {
    const body = normalizeFloatFrameBody(frameBody);
    const key = body.warp ? `${JSON.stringify(body.warp)}|${body.wrap}` : "";
    if (this.warp?.key === key) return;
    this.warp?.dispose();
    this.warp = null;
    if (!body.warp) return;
    this.warp = {
      key,
      dispose: attachOfficeTextWarp({
        source: this.contentDOM,
        host: this.dom,
        overSource: true,
        hide: "fill",
        insetsFromPadding: true,
        warp: body.warp,
        noWrap: body.wrap === "none",
      }),
    };
  }

  destroy(): void {
    this.warp?.dispose();
    this.warp = null;
    this.chrome.destroy();
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.syncOwnAttributes();
    return true;
  }

  /** The chrome's own presses never reach ProseMirror (no caret, no drag). */
  stopEvent(event: Event): boolean {
    return event.target instanceof Node && this.chrome.element.contains(event.target);
  }

  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    // Our own geometry writes are attribute mutations on the wrapper; letting
    // ProseMirror see them would make it re-parse the node and throw the
    // geometry away again.
    if (mutation.type === "attributes") return true;
    if (mutation.type === "selection") return false;
    return !this.contentDOM.contains(mutation.target) && mutation.target !== this.contentDOM;
  }
}

export const floatingTextBoxNodeView: NodeViewRenderer = (props) =>
  new FloatingTextBoxView(props);

/** Each frame wrapper's chrome, so the layout pass can lay it over the frame. */
const chromes = new WeakMap<HTMLElement, TextBoxFrameChromeView>();

/** Lays out the floating objects; returns what it found, null when the editor is not shown. */
function layout(view: EditorView): LayoutObjects | null {
  const root = view.dom as HTMLElement;
  if (!root.isConnected) return null;
  const objects = layoutObjects(root);
  const { wrappers, shapes, pictures, bandShapes } = objects;
  if (wrappers.length === 0 && shapes.length === 0 && pictures.length === 0 && bandShapes.length === 0) return objects;
  const keepOnPage = bodyKeepOnPage(view);
  const hosts = layoutShapes(view, shapes, keepOnPage);
  for (const [id, host] of hostParagraphElements(view, [...wrappers, ...pictures, ...bandShapes])) hosts.set(id, host);
  markFloatsHostedBefore([...wrappers, ...pictures, ...shapes], hosts);
  // Word's floating stack is per document, not per page and not per family:
  // `relativeHeight` is one ordering across every anchor in the body, shapes
  // and text boxes alike. Read from the DOCUMENT rather than from the painted
  // frames, so a frame on a page that is not laid out yet — and every floating
  // shape, which has no frame element at all — still holds its place.
  const stack = documentFloatingStack(view.state.doc).heights;
  layoutPictures(view, pictures, hosts, stack, keepOnPage);
  placeBandShapesAcross(bandShapes);
  // Text boxes set as bands by the last pass: a run holding one is laid out
  // whole once they are placed again (layoutMixedBandRuns).
  const textBoxBandsBefore = mixedBandRunsOn() ? wrappers.filter(isTextBoxFlowBand) : [];
  layoutBandRuns(objects.bandCandidates, hosts, textBoxBandsBefore);
  publishShapeBandRooms(objects.bandCandidates, hosts, keepOnPage);
  if (wrappers.length === 0) {
    if (mixedBandRunsOn()) layoutMixedBandRuns(view, objects.bandCandidates, [], hosts);
    else publishBandRunCharges(view, new Map());
    return objects;
  }
  for (const wrapper of wrappers) {
    const anchor = normalizeFloatAnchor(parseJson(wrapper, "data-float-anchor"));
    const frame = wrapper.querySelector<HTMLElement>(":scope > [data-text-box-frame]");
    if (!anchor || !frame) continue;
    if (anchor.hidden) {
      wrapper.style.display = "none";
      markFloatPageFromCell(wrapper, false);
      continue;
    }
    wrapper.style.display = "";
    const sheet = wrapper.closest<HTMLElement>("article[data-page-sheet]");
    // "Layout in table cell" (VML's `o:allowincell`, on unless written off):
    // a box in front of or behind the text in a cell is placed against the
    // CELL, as a picture there is -- its "page" offset is the cell's. An
    // address label's boxes, written alike in every cell, landed on top of
    // each other in the first column (corpus R31-D02). A wrapped box keeps
    // the page: placed in the cell it would resize the cell it wraps in.
    const inCell = wrapper.closest<HTMLElement>("td, th");
    const cell = sheet && inCell && anchor.layoutInCell && floatFlowMode(anchor) === "overlay" ? inCell : null;
    const container = cell ?? sheet;
    let geometry = cell ? cellGeometry(cell) : sheet ? sheetGeometry(sheet, keepOnPage) : null;
    if (!sheet || !container || !geometry) {
      // Before the paginator has built sheets there is no page to resolve
      // against. Leave the frame in the flow rather than place it at a guess.
      wrapper.dataset.floatMode = "flow";
      frame.style.position = "";
      frame.style.left = "";
      frame.style.top = "";
      markFloatPageFromCell(wrapper, false);
      continue;
    }
    // Where the wrapper itself sits inside the sheet, in the sheet's own CSS
    // pixels. Both rects carry the same editor zoom, so dividing by the
    // pagination scale brings the difference back to layout px.
    const scale = paginationLayoutScale(wrapper);
    const wrapperRect = wrapper.getBoundingClientRect();
    const sheetRect = container.getBoundingClientRect();
    // The wrapper's place in the flow BEFORE the margins the last pass gave
    // a side float or band: measured from the moved box, they fed back in.
    // A shadowed float is marked an overlay yet keeps its float margins: read
    // by its mark, the margin it was given was taken for its place in the
    // flow and grew by its drop on every pass (R286-D01's cover text box:
    // 577 px more each pass, 12,125 px after 36 s, sheet 0 measured again
    // before every plan). On since compared on 9 documents (no page start
    // moved; R281-D04 planned 97 -> 20 times); `window.__docsFloatMarginFromStyle
    // = false` turns it off.
    const floatedByStyle = floatMarginFromStyle() && (wrapper.style.float === "left" || wrapper.style.float === "right") && wrapper.style.position !== "absolute";
    const inFlow = wrapper.dataset.floatMode === "float" || wrapper.dataset.floatMode === "band" || floatedByStyle;
    const applied = inFlow && wrapper.getAttribute(FLOAT_BOTH_SIDES_ATTR) !== "true"
      ? {
          left: wrapper.style.float === "right" ? 0 : Number.parseFloat(wrapper.style.marginLeft) || 0,
          top: givenTopMarginPx(wrapper),
        }
      : { left: 0, top: 0 };
    const originPx = {
      leftPx: (wrapperRect.left - sheetRect.left) / (scale.x || 1) - applied.left,
      topPx: (wrapperRect.top - sheetRect.top) / (scale.y || 1) - applied.top,
    };
    const flowTopPx = cell
      ? flowTopIn(wrapper, cell, hosts, originPx.topPx, scale.y)
      : flowTopOnSheet(wrapper, sheet, hosts, originPx.topPx, scale.y);
    geometry = withAnchorCharacterOrigins(view, wrapper, anchor, geometry, container, hosts, flowTopPx, scale);
    if (!cell) geometry = withProjectedColumnOrigin(wrapper, geometry);
    // A box placed above its place in the flow (from the page or the margin,
    // or a negative offset from its paragraph) wraps lines it can only reach
    // through a shadow in the text above, as a picture does.
    const shadow = cell
      ? null
      : (aboveFlowShadow(view, wrapper, anchor, geometry, sheet, hosts, flowTopPx, originPx.topPx, scale) ??
        droppedPastTableShadow(view, wrapper, anchor, geometry, sheet, hosts, flowTopPx, scale));
    applyPlacement(wrapper, frame, anchor, geometry, stack, flowTopPx, originPx, shadow);
    markFloatPageFromCell(wrapper, inCell !== null && cell === null && wrapper.dataset.floatMode === "overlay");
    // A box placed in a cell records where it is on the page: the cell's
    // own place on the sheet added.
    const cellShift = cell
      ? (() => {
          const cellRect = cell.getBoundingClientRect();
          const pageRect = sheet.getBoundingClientRect();
          return {
            leftPx: (cellRect.left - pageRect.left) / (scale.x || 1),
            topPx: (cellRect.top - pageRect.top) / (scale.y || 1),
          };
        })()
      : { leftPx: 0, topPx: 0 };
    recordFramePaint(wrapper, anchor, { ...geometry, flowTopPx }, scale, cellShift);
    chromes.get(wrapper)?.sync();
  }
  if (mixedBandRunsOn()) layoutMixedBandRuns(view, objects.bandCandidates, wrappers.filter(isTextBoxFlowBand), hosts);
  else {
    for (const wrapper of wrappers) wrapper.removeAttribute(BAND_RUN_ATTR);
    publishBandRunCharges(view, new Map());
  }
  return objects;
}

/**
 * Where the frame is painted and where offset 0 of each of its axes lands, in
 * page px: what a drag of the frame turns into Word's `wp:posOffset` on the
 * same origins (an aligned axis included -- Word makes a dragged box's
 * position absolute).
 */
function recordFramePaint(
  wrapper: HTMLElement,
  anchor: FloatAnchor,
  geometry: FloatPageGeometry,
  scale: { x: number; y: number },
  shift: { leftPx: number; topPx: number } = { leftPx: 0, topPx: 0 },
): void {
  floatPaints.set(wrapper, measureFloatPaint(anchor, geometry, scale, shift));
  const placement = placeFloatOnPage(anchor, geometry);
  const zero = resolveFloatPlacement(
    {
      ...anchor,
      horizontal: { relativeFrom: anchor.horizontal.relativeFrom, offsetEmu: 0 },
      vertical: { relativeFrom: anchor.vertical.relativeFrom, offsetEmu: 0 },
      groupTransform: undefined,
      simplePos: false,
    },
    geometry,
  );
  recordTextBoxFramePaint(wrapper, {
    bandLeftPx: zero.leftPx + shift.leftPx,
    bandTopPx: zero.topPx + shift.topPx,
    leftPx: placement.leftPx + shift.leftPx,
    topPx: placement.topPx + shift.topPx,
    widthPx: placement.widthPx,
    heightPx: placement.heightPx,
    scaleX: scale.x || 1,
    scaleY: scale.y || 1,
  });
}








interface ShapeLayoutPass {
  readonly sheets: Map<
    HTMLElement,
    {
      readonly geometry: FloatPageGeometry | null;
      readonly scale: { x: number; y: number };
      readonly rect: DOMRect;
      /** The geometry and zoom as one comparable value. */
      readonly signature: string;
      /** The page column the sheet stands in (ink snaps to its pixels). */
      readonly column: HTMLElement | null;
    }
  >;
  readonly columnRects: Map<HTMLElement, DOMRect>;
  /** Host paragraphs' and containers' boxes, measured once a pass. */
  readonly rects: Map<HTMLElement, DOMRect>;
}










interface OverlayPlacementInputs {
  anchor: string | null;
  sheet: string;
  originLeft: number;
  originTop: number;
  flowTop: number;
  flowLeft: number | null;
  lineTop: number | null;
  columnLeft: number;
  columnTop: number;
  marginLeft: string;
  marginTop: string;
  left: string;
  /** The projected column's left the "column" origin is taken from (`withProjectedColumnOrigin`). */
  projectedColumnLeft?: number | null;
}
const overlayPlacements = new WeakMap<HTMLElement, OverlayPlacementInputs>();
/** Each ink stage's drawing canvas, looked up once. */
const stageCanvases = new WeakMap<HTMLElement, HTMLElement | null>();

function stageCanvas(stage: HTMLElement): HTMLElement | null {
  const cached = stageCanvases.get(stage);
  if (cached !== undefined && (cached === null || stage.contains(cached))) return cached;
  const canvas = stage.querySelector<HTMLElement>("[data-document-shape-canvas]");
  stageCanvases.set(stage, canvas);
  return canvas;
}

/**
 * What an In Front Of / Behind Text shape paints: its stage stands where
 * offset 0 of its anchor lands (`documentShapeFloatLayoutAnchor` lays it out
 * with no offset) and the shape's own margins are its live offsets, so the
 * pass's reading of the anchor is the stage's place, not the shape's. Kept
 * as that, the alignment guides matched the shape's paragraph corner instead
 * of the shape (and a drop was re-anchored from there, floatReanchor).
 */
function overlayShapePaint(paint: FloatPaint, stage: HTMLElement): FloatPaint {
  const canvas = stageCanvas(stage);
  const left = canvas ? pixels(canvas.style.marginLeft) : 0;
  const top = canvas ? pixels(canvas.style.marginTop) : 0;
  return left || top ? { ...paint, leftPx: paint.leftPx + left, topPx: paint.topPx + top } : paint;
}













export const FLOAT_OVERHANG_ATTR = "data-float-overhang";

function markFloatOverhangs(elements: readonly HTMLElement[]): Map<HTMLElement, string> {
  // The edges each page's objects hang past, by page.
  const pages = new Map<HTMLElement, string>();
  for (const element of elements) {
    const paint = floatPaints.get(element);
    let value = "";
    if (paint && !element.hasAttribute("data-ink-tool") && !element.closest("td, th")) {
      const { pageWidthPx, pageHeightPx } = paint.geometry;
      const edges: string[] = [];
      if (paint.topPx < -0.5) edges.push("up");
      if (paint.topPx + paint.heightPx > pageHeightPx + 0.5) edges.push("down");
      if (paint.leftPx < -0.5 || paint.leftPx + paint.widthPx > pageWidthPx + 0.5) edges.push("side");
      if (edges.length > 0 && !normalizeFloatAnchor(parseJson(element, "data-float-anchor"))?.behindDoc) {
        value = edges.join(" ");
      }
    }
    if (value) {
      const sheet = element.closest<HTMLElement>("article[data-page-sheet]");
      if (sheet) pages.set(sheet, `${pages.get(sheet) ?? ""} ${value}`);
    }
    if ((element.getAttribute(FLOAT_OVERHANG_ATTR) ?? "") === value) continue;
    if (value) element.setAttribute(FLOAT_OVERHANG_ATTR, value);
    else element.removeAttribute(FLOAT_OVERHANG_ATTR);
  }
  return pages;
}

/**
 * The order the pages holding overhanging objects stack in, as rules in the
 * document's head -- never an attribute on a page, which the editor's
 * layout watches (dragSheetLift). A page hanging down is drawn over the
 * pages after it, and earlier such pages over later ones (2L - i, L pages);
 * a page hanging only up or aside is drawn over the page before it (i + 1),
 * under any page hanging down (one hanging down onto one hanging up wins:
 * whole pages stack, not objects). The pages are inside the content's own
 * stacking context (note-editor.css), so no value reaches the overlays over
 * them (line numbers, header and footer bands). A rule matches only a page
 * that holds such an object, so another editor's page at the same place is
 * not raised. `held` keeps the sheet and its text: an unchanged order
 * writes nothing.
 */
function orderOverhangingPages(
  view: EditorView,
  pages: ReadonlyMap<HTMLElement, string>,
  held: { style: HTMLStyleElement | null; text: string },
): void {
  const rules: string[] = [];
  const count = view.dom.children.length;
  const has = (edge: string) => `:has(> [${FLOAT_OVERHANG_ATTR}${edge}], > * > [${FLOAT_OVERHANG_ATTR}${edge}])`;
  for (const [sheet, edges] of pages) {
    if (sheet.parentElement !== view.dom) continue;
    const index = Array.prototype.indexOf.call(view.dom.children, sheet);
    const down = /\bdown\b/.test(edges);
    rules.push(
      `.note-editor-content > article[data-page-sheet]:nth-child(${index + 1})${has(down ? '~="down"' : "")} { z-index: ${down ? 2 * count - index : index + 1}; }`,
    );
  }
  const text = rules.join("\n");
  if (text === held.text) return;
  held.text = text;
  if (!text) {
    held.style?.remove();
    held.style = null;
    return;
  }
  if (!held.style) {
    held.style = view.dom.ownerDocument.createElement("style");
    held.style.setAttribute("data-float-overhang-order", "");
    view.dom.ownerDocument.head.appendChild(held.style);
  }
  held.style.textContent = text;
}

function sameOverlayInputs(a: OverlayPlacementInputs | undefined, b: OverlayPlacementInputs): boolean {
  return (
    !!a &&
    a.anchor === b.anchor &&
    a.sheet === b.sheet &&
    a.originLeft === b.originLeft &&
    a.originTop === b.originTop &&
    a.flowTop === b.flowTop &&
    a.flowLeft === b.flowLeft &&
    a.lineTop === b.lineTop &&
    a.columnLeft === b.columnLeft &&
    a.columnTop === b.columnTop &&
    a.marginLeft === b.marginLeft &&
    a.marginTop === b.marginTop &&
    a.left === b.left &&
    (a.projectedColumnLeft ?? null) === (b.projectedColumnLeft ?? null)
  );
}

/**
 * A stroke of ink the stylesheet takes out of the flow (DocumentShapeBlock:
 * an overlay ink shape standing on a page not set in newspaper columns).
 */
const inkAtRestByView = new WeakMap<EditorView, InkAtRest>();

function inkAtRestOf(view: EditorView): InkAtRest {
  let rest = inkAtRestByView.get(view);
  if (!rest) inkAtRestByView.set(view, (rest = new InkAtRest(view.dom as HTMLElement)));
  return rest;
}

function outOfFlowInk(element: Element): boolean {
  const parent = element.parentElement;
  return (
    element.tagName === "FIGURE" &&
    element.getAttribute("data-float-mode") === "overlay" &&
    element.hasAttribute("data-ink-tool") &&
    parent?.tagName === "ARTICLE" &&
    parent.hasAttribute("data-page-sheet") &&
    !parent.hasAttribute("data-page-column-flow")
  );
}

function layoutShapes(
  view: EditorView,
  allShapes: readonly HTMLElement[],
  keepOnPage: FloatKeepOnPage,
): Map<string, HTMLElement> {
  const pass: ShapeLayoutPass = { sheets: new Map(), columnRects: new Map(), rects: new Map() };
  const sheetOf = (sheet: HTMLElement) => {
    let entry = pass.sheets.get(sheet);
    if (!entry) {
      const geometry = sheetGeometry(sheet, keepOnPage);
      const scale = paginationLayoutScale(sheet);
      entry = {
        geometry,
        scale,
        rect: sheet.getBoundingClientRect(),
        signature: `${JSON.stringify(geometry)}|${scale.x}|${scale.y}`,
        column: sheet.closest<HTMLElement>(PAGE_SURFACE_SELECTOR),
      };
      pass.sheets.set(sheet, entry);
    }
    return entry;
  };
  const rectOf = (element: HTMLElement) => {
    let rect = pass.rects.get(element);
    if (!rect) {
      rect = element.getBoundingClientRect();
      pass.rects.set(element, rect);
    }
    return rect;
  };
  // Where a stroke of ink out of the flow would have stood in it: under the
  // in-flow block before it, after that block's space after (a zero-height
  // block in the flow stood there; documentInk measures a new stroke from
  // the same point). Strokes in a row share the answer, found once.
  const inFlowTops = new Map<Element, number>();
  const contentTopOf = (parent: HTMLElement, scaleY: number) => {
    let top = inFlowTops.get(parent);
    if (top === undefined) {
      const style = getComputedStyle(parent);
      top = rectOf(parent).top + ((Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.paddingTop) || 0)) * scaleY;
      inFlowTops.set(parent, top);
    }
    return top;
  };
  const inFlowTopOf = (element: HTMLElement, scaleY: number): number => {
    const chain: Element[] = [];
    let top: number | undefined;
    for (let current: Element = element; top === undefined; ) {
      const known = inFlowTops.get(current);
      if (known !== undefined) {
        top = known;
        break;
      }
      chain.push(current);
      const previous = current.previousElementSibling;
      if (!previous) {
        top = current.parentElement ? contentTopOf(current.parentElement, scaleY) : rectOf(element).top;
        break;
      }
      if (!outOfFlowInk(previous)) {
        const style = getComputedStyle(previous);
        if (style.display !== "none" && style.position !== "absolute" && style.position !== "fixed") {
          top = rectOf(previous as HTMLElement).bottom + Math.max(0, Number.parseFloat(style.marginBottom) || 0) * scaleY;
          break;
        }
      }
      current = previous;
    }
    for (const link of chain) inFlowTops.set(link, top);
    return top;
  };
  const columnRectOf = (column: HTMLElement) => {
    let rect = pass.columnRects.get(column);
    if (!rect) {
      rect = column.getBoundingClientRect();
      pass.columnRects.set(column, rect);
    }
    return rect;
  };
  // A shape in front of or behind the text takes no room in the flow, so
  // moving its stage moves nothing any other shape measures: those are all
  // measured first and moved after, under one layout. Moving each before
  // measuring the next forced a layout per shape -- and every ink stroke is
  // one, so a page of handwriting relaid the whole document once per stroke
  
  const overlayMoves: Array<{ stage: HTMLElement; at: { left: string; top: string; canvasTranslate?: string } }> = [];
  // Strokes of ink that stand where they stood are not read at all (InkAtRest).
  const rest = allShapes.some(outOfFlowInk) ? inkAtRestOf(view) : null;
  rest?.beginPass();
  const standings = new Map<Element, string>();
  const standingOf = (sheet: HTMLElement): string => {
    let standing = standings.get(sheet);
    if (standing === undefined) {
      const entry = sheetOf(sheet);
      const column = entry.column ? columnRectOf(entry.column) : null;
      // Of the sheet's place in its column only the part below a whole pixel
      // places a stroke (inkStageOnWholePixels): a sheet moved down whole
      // pixels (the one above it settling 28 px shorter after the note
      // opened) took all of its strokes out of the layer at the first stroke
      // written, 900 on a 3,000-stroke note.
      standing = `${entry.signature}|${column ? subPixel(entry.rect.left - column.left, entry.scale.x) : 0}|${column ? subPixel(entry.rect.top - column.top, entry.scale.y) : 0}`;
      standings.set(sheet, standing);
    }
    return standing;
  };
  const shapes = !rest ? allShapes : allShapes.filter((wrapper) => {
    if (!outOfFlowInk(wrapper)) return true;
    const sheet = wrapper.parentElement as HTMLElement;
    // A stroke on a sleeping sheet is not read now (reading it wakes the sheet):
    // the first pass after the sheet wakes measures it.
    if (sheet.hasAttribute(SHEET_DORMANT_ATTR)) {
      if (!rest.atRest(wrapper, sheet, standingOf(sheet), true)) rest.deferAsleep(wrapper, sheet);
      return false;
    }
    // In its sheet's layer (inkSheetLayer) the sweep leaves it too: asking its
    // skipped contents where they stand would lay every stroke out again.
    return !rest.atRest(wrapper, sheet, standingOf(sheet), strokeInLayer(wrapper));
  });
  // A stroke the layer draws is out of the render tree: one this pass must
  // place again (its sheet moved) is drawn by itself first, and goes back to
  // the layer when the page next rests.
  for (const wrapper of shapes) if (strokeInLayer(wrapper)) takeStrokeOutOfLayer(wrapper);
  const hosts = hostParagraphElements(view, shapes);
  for (const wrapper of shapes) {
    const rawAnchor = wrapper.getAttribute("data-float-anchor");
    const anchor = shapeAnchor(wrapper, rawAnchor);
    const stage = shapeStage(wrapper);
    if (!anchor || !stage) continue;
    const overlay = wrapper.getAttribute("data-float-mode") === "overlay";
    // Most shapes (every stroke of ink) are blocks of the page itself.
    const parent = wrapper.parentElement;
    const sheet =
      parent?.tagName === "ARTICLE" && parent.hasAttribute("data-page-sheet")
        ? parent
        : wrapper.closest<HTMLElement>("article[data-page-sheet]");
    // `layoutInCell`: a shape anchored in a table cell is placed against the
    // CELL. The sheet is still needed for the section's column count.
    const inCell = wrapper.closest<HTMLElement>("td, th");
    const cell = anchor.layoutInCell ? inCell : null;
    const container: HTMLElement | null = cell ?? sheet;
    const onSheet = !cell && sheet ? sheetOf(sheet) : null;
    let geometry = cell ? cellGeometry(cell) : onSheet ? onSheet.geometry : null;
    markFloatPageFromCell(wrapper, overlay && inCell !== null && cell === null && Boolean(sheet && geometry));
    if (!sheet || !container || !geometry) {
      // No page yet to resolve against: the stage stays parked at the
      // wrapper, which is at least the anchor's own place in the flow.
      stage.style.left = "";
      stage.style.top = "";
      stage.style.translate = "";
      const canvas = stageCanvas(stage);
      if (canvas) {
        canvas.style.translate = "";
        const paint = canvas.querySelector<HTMLElement>(":scope > [data-document-shape-paint]");
        if (paint) paint.style.translate = "";
      }
      continue;
    }
    const scale = onSheet ? onSheet.scale : paginationLayoutScale(wrapper);
    const wrapperRect = wrapper.getBoundingClientRect();
    const containerRect = onSheet ? onSheet.rect : container.getBoundingClientRect();
    // A side float is measured from its place in the flow, before the top
    // margin the last pass gave it (none while it is out of the flow).
    const appliedTopPx = overlay || wrapper.style.position === "absolute" ? 0 : givenTopMarginPx(wrapper);
    const originPx = {
      leftPx: (wrapperRect.left - containerRect.left) / (scale.x || 1),
      topPx: (wrapperRect.top - containerRect.top) / (scale.y || 1) - appliedTopPx,
    };
    const ink = overlay && wrapper.hasAttribute("data-ink-tool");
    // Out of the flow (a stroke of ink, or a wrapped shape drawn at its page
    // point) the wrapper's own box is where the LAST pass put it: a shape
    // with no host paragraph of its own (a preserved SmartArt) measured its
    // paragraph origin from there and walked down the page by its offset on
    // every pass (0.5" below its paragraph, drawn 228pt low).
    const outOfFlow = (ink && outOfFlowInk(wrapper)) || (!overlay && wrapper.style.position === "absolute");
    const fallbackTopPx =
      outOfFlow && !cell
        ? (inFlowTopOf(wrapper, scale.y || 1) - containerRect.top) / (scale.y || 1)
        : originPx.topPx;
    const flowTopPx = flowTopIn(wrapper, container, hosts, fallbackTopPx, scale.y, rectOf);
    geometry = withAnchorCharacterOrigins(view, wrapper, anchor, geometry, container, hosts, flowTopPx, scale);
    if (!cell) geometry = withProjectedColumnOrigin(wrapper, geometry);
    // Kept for the Layout Options a shape takes next (Move with Text / Fix
    // Position on Page): its origins on the page. Ink is never one of them.
    if (!wrapper.hasAttribute("data-ink-tool")) {
      const shift = cell
        ? {
            leftPx: (containerRect.left - sheet.getBoundingClientRect().left) / (scale.x || 1),
            topPx: (containerRect.top - sheet.getBoundingClientRect().top) / (scale.y || 1),
          }
        : { leftPx: 0, topPx: 0 };
      const measured = measureFloatPaint(anchor, { ...geometry, flowTopPx }, scale, shift);
      floatPaints.set(wrapper, overlay ? overlayShapePaint(measured, stage) : measured);
    }
    if (overlay) {
      const column = !ink ? null : onSheet ? onSheet.column : wrapper.closest<HTMLElement>(PAGE_SURFACE_SELECTOR);
      const columnRect = column ? columnRectOf(column) : null;
      const canvas = ink ? stageCanvas(stage) : null;
      const inputs: OverlayPlacementInputs = {
        anchor: rawAnchor,
        sheet: onSheet ? onSheet.signature : `cell|${JSON.stringify(geometry)}`,
        originLeft: originPx.leftPx,
        originTop: originPx.topPx,
        flowTop: flowTopPx,
        flowLeft: geometry.flowLeftPx ?? null,
        lineTop: geometry.lineTopPx ?? null,
        columnLeft: columnRect ? wrapperRect.left - columnRect.left : 0,
        columnTop: columnRect ? wrapperRect.top - columnRect.top : 0,
        marginLeft: canvas?.style.marginLeft ?? "",
        marginTop: canvas?.style.marginTop ?? "",
        left: stage.style.left,
        projectedColumnLeft: geometry.columnLeftPx ?? null,
      };
      if (sameOverlayInputs(overlayPlacements.get(wrapper), inputs)) continue;
      const placed = overlayStagePosition(anchor, geometry, flowTopPx, originPx);
      const at = ink ? inkStageOnWholePixels(wrapper, stage, placed, wrapperRect, scale, pass) : placed;
      overlayMoves.push({ stage, at });
      overlayPlacements.set(wrapper, inputs);
      continue;
    }
    overlayPlacements.delete(wrapper);
    const outOfFlowOrigin = outOfFlow && !cell ? fallbackTopPx : originPx.topPx;
    const shadow = cell
      ? null
      : (aboveFlowShadow(view, wrapper, anchor, geometry, sheet, hosts, flowTopPx, outOfFlowOrigin, scale) ??
        droppedPastTableShadow(view, wrapper, anchor, geometry, sheet, hosts, flowTopPx, scale));
    applyShapePlacement(wrapper, stage, anchor, geometry, sheet, flowTopPx, { ...originPx, topPx: outOfFlowOrigin }, shadow);
  }
  for (const { stage, at } of overlayMoves) placeOverlayStage(stage, at);
  // What the stages read back as is what the next pass compares with.
  for (const { stage } of overlayMoves) {
    const wrapper = stage.parentElement;
    const inputs = wrapper ? overlayPlacements.get(wrapper) : undefined;
    if (inputs) inputs.left = stage.style.left;
  }
  rest?.endPass(standings);
  return hosts;
}

const floatingTextBoxLayoutKey = new PluginKey("floatingTextBoxLayout");
/** After this long with no pass, every stroke is measured once more. */
const INK_SWEEP_AFTER_QUIET_MS = 2500;

export const FloatingTextBoxLayout = Extension.create({
  name: "floatingTextBoxLayout",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: floatingTextBoxLayoutKey,
        view: (view) => {
          let frame = 0;
          const shadowBudget = { count: 0, windowStart: 0 };
          const overhangOrder: { style: HTMLStyleElement | null; text: string } = { style: null, text: "" };
          // Body objects over a page's header or footer: the bands are cut
          // around them (paged/bandObjectHoles), again whenever a band layer
          // draws its elements anew (a strip scrolled into view).
          const bandHoles = createBandHoles();
          const recutBands = () => {
            try {
              cutBandsAroundBodyObjects(view, bandHoles);
            } catch {
              // A band left whole is the old behaviour, never a lost page.
            }
          };
          window.addEventListener(BAND_LAYER_DRAWN_EVENT, recutBands);
          let sweepTimer: ReturnType<typeof setTimeout> | null = null;
          const sweepWhenQuiet = () => {
            if (sweepTimer !== null) clearTimeout(sweepTimer);
            sweepTimer = setTimeout(() => {
              sweepTimer = null;
              if (inkPointerArbiter.strokeRunning()) {
                sweepWhenQuiet();
                return;
              }
              inkAtRestByView.get(view)?.sweep();
              sweeping = true;
              schedule();
            }, INK_SWEEP_AFTER_QUIET_MS);
          };
          let sweeping = false;
          // A key typed that leaves its paragraph as tall as it was moves no
          // object: nothing below it moved. The pass waits for the hand to
          // pause, and for the line that does move something (a table-heavy
          // page with pictures: 11 ms of every key, and its attributes
          // written again each time).
          let caretBlock: { element: HTMLElement; height: number; sheets: number } | null = null;
          let typingTimer: ReturnType<typeof setTimeout> | null = null;
          const typedInPlace = () => {
            const sinceTyping = msSinceTyping();
            const { $from } = view.state.selection;
            const element = $from.parent.isTextblock && $from.depth > 0 ? view.nodeDOM($from.before()) : null;
            const now = element instanceof HTMLElement
              ? { element, height: element.getBoundingClientRect().height, sheets: view.state.doc.childCount }
              : null;
            const same = caretBlock !== null && now !== null && caretBlock.element === now.element &&
              caretBlock.height === now.height && caretBlock.sheets === now.sheets;
            caretBlock = now;
            if (!same || sinceTyping >= TYPING_IDLE_MS) return false;
            if (typingTimer === null) {
              typingTimer = setTimeout(() => {
                typingTimer = null;
                schedule();
              }, TYPING_IDLE_MS - sinceTyping);
            }
            return true;
          };
          const schedule = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
              frame = 0;
              if (!sweeping && typedInPlace()) return;
              const passStarted = performance.now();
              let objects: LayoutObjects | null = null;
              try {
                objects = layout(view);
                if (reflowChains(view)) objects = layout(view);
                // A line-level break between linked boxes; a reservation that
                // changed hands its push-out to the chain pass once more.
                if (layoutChainContinuations(view) && reflowChains(view)) {
                  objects = layout(view);
                  layoutChainContinuations(view);
                }
                if (objects) orderOverhangingPages(view, markFloatOverhangs(objects.all), overhangOrder);
                if (objects) {
                  bandHoles.intruders = bodyObjectsInBandAreas(view, objects.all, floatPaintOf);
                  recutBands();
                }
              } catch {
                // A frame that cannot be measured keeps its last geometry;
                // losing a position is never worth losing the editor.
                objects = null;
              }
              // The shadows the pass asked for, drawn after it (a dispatch
              // re-lays the page; the next pass finds the same and stops).
              // The pass already walked the document for the wrappers that
              // publish one.
              // A pass that failed hands over nothing: the wrap pass looks for itself.
              publishFloatBothSides(
                view,
                objects?.all.filter((element) => element.getAttribute(FLOAT_BOTH_SIDES_ATTR) === "true") ?? null,
              );
              try {
                syncFloatShadows(
                  view,
                  shadowBudget,
                  objects?.all.filter((element) => element.hasAttribute(FLOAT_SHADOW_SPEC_ATTR)),
                );
              } catch {
                // Same bargain: a shadow that cannot be drawn is not drawn.
              }
              inkTraceWork("float", performance.now() - passStarted);
              // A sweep ends the run of passes; it does not start another.
              if (sweeping) sweeping = false;
              else if (inkAtRestByView.has(view)) sweepWhenQuiet();
            });
          };
          schedule();
          // The sheet layer merges a sheet's strokes only once a pass measured
          // them where they stand (inkSheetLayer).
          setInkLayerSettler(view, {
            // A sheet whose strokes flow in its columns is not one InkAtRest keeps.
            settled: (sheet) =>
              sheet.hasAttribute("data-page-column-flow") || (inkAtRestByView.get(view)?.sheetSettled(sheet) ?? true),
            measure: schedule,
          });
          return {
            update: schedule,
            destroy: () => {
              setInkLayerSettler(view, null);
              if (frame) cancelAnimationFrame(frame);
              if (sweepTimer !== null) clearTimeout(sweepTimer);
              if (typingTimer !== null) clearTimeout(typingTimer);
              inkAtRestByView.get(view)?.disconnect();
              inkAtRestByView.delete(view);
              overhangOrder.style?.remove();
              window.removeEventListener(BAND_LAYER_DRAWN_EVENT, recutBands);
              bandHoles.intruders = [];
              recutBands();
            },
          };
        },
      }),
      createFloatBothSidesWrapPlugin(),
      createFloatBandLineSwapPlugin(),
      createFloatShadowWrapPlugin(),
    ];
  },
});

/** On unless `window.__docsFloatMarginFromStyle = false`: a box's own
 * float margins are taken off its measured place whenever it is drawn as a
 * float, whatever its mode mark says. */
function floatMarginFromStyle(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsFloatMarginFromStyle?: boolean }).__docsFloatMarginFromStyle !== false;
}
