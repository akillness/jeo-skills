/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Draw-tab ink on the mounted page: the operations the Draw tab runs against
 * the editor view. Pure geometry and the stroke model live in
 * `@/lib/document-ink`; this file knows the DOM (where the pages are, how far
 * they are zoomed) and the document (where a stroke's paragraph is).
 *
 * A stroke is identified by its position in the document at the moment a
 * gesture starts, and every write re-checks that the document is still the
 * one the gesture read (`sourceDoc`), so a stroke erased is always the one
 * the pointer touched. A draw and an erase each enter history once.
 */

import { INK_LIGHT_ATTR, inkLightStandIn } from "./paged/inkLightLayer";
import { mintFreshBlockId, MRNOTE_BLOCK_ID_ATTR } from "./blockIds";
import { inkLayerDrawingOf } from "./paged/inkSheetLayer";
import { inkScratchOutTakes } from "../../../../lib/office-ink-scratch-out";
import { documentFontSizePx } from "./documentFontSize";
import { EMU_PER_PT, ptToPx } from "../../../../lib/office-units";
import { inkTraceWork } from "../../../../lib/ink-input-trace";
import { closeHistory } from "@tiptap/pm/history";
import { DOMSerializer, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { officeFramePlace } from "../../../../lib/office-object-frame";

import type { Mark as ProseMirrorMark, NodeType, ResolvedPos, Schema } from "@tiptap/pm/model";
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import {
  DOCUMENT_SHAPE_DEFAULT_RELATIVE_HEIGHT,
  DOCUMENT_SHAPE_EMU_PER_PX,
  DOCUMENT_SHAPE_MIN_EDGE_EMU,
  documentShapeKeyPatch,
  documentShapeTextBoxDefaultAttrs,
  nextDocumentFloatingHeight as nextRelativeHeight,
  normalizeDocumentShapeAttrs,
  type DocumentShapeAttrs,
} from "../../../../lib/document-shapes";
import {
  officeInkEquationFontSizePt,
  officeInkNearestSize,
  officeInkTextBoxSize,
  officeInkTextEmExtent,
  officeInkTextLineWidthPx,
  officeInkWritingLinesOf,
  officeInkWrittenTextSizes,
} from "../../../../lib/office-ink-conversion";
import { renderValidatedKatexMarkup } from "../extensions/lazyKatex";
import { PAGED_AWAITS_FOLLOW_UP_META } from "../../../../lib/collab/paged-history-meta";
import { OFFICE_FONT_SIZE_PRESETS } from "../../../office-ribbon/officeFontSizeCatalog";
import type { PresentationCustomPath } from "../../../../lib/presentation-freeform";
import {
  documentInkFloatAnchor,
  documentInkPathFractions,
  documentInkRunsInside,
  documentInkStrokeAttrs,
  documentInkPolylineBetween,
  documentInkStrokeStyle,
  documentInkTapeFlipped,
  isDocumentInkShapeAttrs,
  normalizeInkCutEnds,
  normalizeInkTape,
  type DocumentInkBounds,
  type DocumentInkPoint,
  type DocumentInkStrokePiece,
  type DocumentInkStrokeStyle,
} from "../../../../lib/document-ink";
import { documentDrawnShapeOutline, documentShapeFromInkStroke } from "../../../../lib/document-ink-to-shape";
import { EQUATION_NODE_BY_PLACEMENT } from "../extensions/equationPlacement";
import type { PersistedInkPath } from "../../../../lib/presentation-annotation";
import { documentViewScale } from "./documentObjectResize";
import { documentShapeBoundaryOutsideList } from "./documentShapeInsertion";
import { documentShapeStoryFromLegacy, documentShapeTakesStory } from "./documentShapeStory";
import { appendBlankPageAtDocumentEnd } from "./trailingBlankPage";
import { SAVED_WITHOUT_HISTORY_META } from "./readOnlyTransactionAuthority";

export type DocumentInkClientPoint = DocumentInkPoint;

const SHAPE_NODE_NAME = "documentShape";
const PAGE_SHEET_SELECTOR = "article[data-page-sheet]";

/**
 * The editor's page sheets. They are the editor root's own children; a
 * selector walk visited every element of the document, every stroke of
 * ink's drawing included, each time a stroke was drawn or landed.
 */
function pageSheetsOf(view: EditorView): HTMLElement[] {
  const sheets: HTMLElement[] = [];
  for (const child of view.dom.children) {
    if (child.tagName === "ARTICLE" && child.hasAttribute("data-page-sheet")) sheets.push(child as HTMLElement);
  }
  return sheets.length > 0 ? sheets : Array.from(view.dom.querySelectorAll<HTMLElement>(PAGE_SHEET_SELECTOR));
}
const SHAPE_CANVAS_SELECTOR = "[data-document-shape-canvas]";

/**
 * On the transaction that lands ink: hosts that only mirror the document
 * (the ribbon's button states) may catch up after the hand pauses instead of
 * on every stroke.
 */
export const DOCUMENT_INK_LANDING_META = "documentInkLanding";

/** On the editor's wrapper while the Draw tab has an ink tool picked. */
export const DOCUMENT_INK_JOINED_PAGES_ATTR = "data-ink-joined-pages";








export function setDocumentInkPagesJoined(wrapper: HTMLElement, joined: boolean): void {
  if (wrapper.hasAttribute(DOCUMENT_INK_JOINED_PAGES_ATTR) === joined) return;
  const scroller = wrapper.closest<HTMLElement>(".note-window-scroll");
  const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
  const sheets = Array.from(wrapper.querySelectorAll<HTMLElement>(PAGE_SHEET_SELECTOR));
  const held = sheets.find((sheet) => sheet.getBoundingClientRect().bottom > viewTop) ?? null;
  const before = held?.getBoundingClientRect().top ?? 0;
  wrapper.toggleAttribute(DOCUMENT_INK_JOINED_PAGES_ATTR, joined);
  if (scroller && held) {
    const moved = held.getBoundingClientRect().top - before;
    if (Math.abs(moved) >= 0.5) scroller.scrollTop += moved;
  }
}














export function keepDocumentPagesCentred(wrapper: HTMLElement): () => void {
  const scroller = wrapper.closest<HTMLElement>(".note-window-scroll");
  const surface = wrapper.querySelector<HTMLElement>('[data-testid="note-editor-page-surface"]');
  if (!scroller || !surface) return () => {};
  const ownOverflowX = scroller.style.overflowX;
  let settle = 0;
  let placedLeft = scroller.scrollLeft;
  const apply = () => {
    settle = 0;
    // The paper as it is seen: the surface is scaled by the zoom.
    const paper = surface.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const inner = view.width - (scroller.offsetWidth - scroller.clientWidth);
    const fits = paper.width > 0 && paper.width <= inner + 0.5;
    if (!fits) {
      scroller.style.overflowX = ownOverflowX;
      placedLeft = scroller.scrollLeft;
      return;
    }
    // Hidden, not just centred: a finger's pan and the native scroll both
    // read a container that does not scroll that way as one they cannot move.
    scroller.style.overflowX = "hidden";
    const drift = paper.left + paper.width / 2 - (view.left + inner / 2);
    if (Math.abs(drift) >= 1) scroller.scrollLeft += drift;
    placedLeft = scroller.scrollLeft;
  };
  const later = () => {
    if (settle) cancelAnimationFrame(settle);
    settle = requestAnimationFrame(apply);
  };
  apply();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(later) : null;
  observer?.observe(scroller);
  observer?.observe(wrapper);
  observer?.observe(surface);
  // A zoom scales the surface without resizing it, and states its scale and
  // the room it reserves on the surface's style.
  const zoomed = typeof MutationObserver !== "undefined" ? new MutationObserver(later) : null;
  zoomed?.observe(surface, { attributes: true, attributeFilter: ["style"] });
  const sideways = () => {
    if (scroller.scrollLeft !== placedLeft) later();
  };
  scroller.addEventListener("scroll", sideways, { passive: true });
  return () => {
    if (settle) cancelAnimationFrame(settle);
    observer?.disconnect();
    zoomed?.disconnect();
    scroller.removeEventListener("scroll", sideways);
    scroller.style.overflowX = ownOverflowX;
  };
}

/** The joined pages' extent on screen: the first sheet's top to the last one's bottom. */
export function documentInkPagesStrip(view: EditorView): { top: number; bottom: number } | null {
  // The sheets laid out, as documentInkPageAt reads them: a sheet not laid
  
  // measures 0 x 0 at the viewport's corner, and taken as the last page it
  // ended the strip at the top of the screen -- every stroke was cut to a
  // sliver there, on the live canvas and as wet ink, until it landed.
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const sheet of pageSheetsOf(view)) {
    const rect = sheet.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) continue;
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  }
  return bottom > top ? { top, bottom } : null;
}

/** Whether the pages `view` lays out are joined for drawing. */
export function documentInkPagesJoined(view: EditorView): boolean {
  return view.dom.closest(`[${DOCUMENT_INK_JOINED_PAGES_ATTR}]`) !== null;
}

/** Every ink stroke in the document, by position. */
export function documentInkStrokes(
  doc: ProseMirrorNode,
): Array<{ pos: number; node: ProseMirrorNode }> {
  const strokes: Array<{ pos: number; node: ProseMirrorNode }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== SHAPE_NODE_NAME) return true;
    if (isDocumentInkShapeAttrs(node.attrs)) strokes.push({ pos, node });
    return false;
  });
  return strokes;
}

/** Whether the document holds any ink stroke (stops at the first). */
export function documentHasInk(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.type.name !== SHAPE_NODE_NAME) return true;
    if (isDocumentInkShapeAttrs(node.attrs)) found = true;
    return false;
  });
  return found;
}









export function documentHasInkErasable(doc: ProseMirrorNode): boolean {
  const handwriting = isHandwritingDocumentDoc(doc);
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.type.name !== SHAPE_NODE_NAME) return true;
    if (isDocumentInkShapeAttrs(node.attrs) || (handwriting && isHandwritingObjectNode(node))) found = true;
    return false;
  });
  return found;
}

/** The painted canvas of the stroke at `pos`, when it is on screen. A stroke
 * drawn by its sheet's layer (paged/inkSheetLayer) is out of the render tree:
 * it is measured where the layer paints it (the same box: a stroke goes into
 * the layer only drawn plainly, never turned), and found on its own sheet.
 * What callers read of a canvas is its box and its sheet; the stand-in answers
 * those, with no own size (an unturned stroke is measured by its box). */
export function documentInkCanvas(
  view: EditorView,
  pos: number,
): HTMLElement | null {
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  // Drawn by its sheet's layer from its attributes (paged/inkLightLayer):
  // its place worked out the same way.
  if (dom.hasAttribute(INK_LIGHT_ATTR)) return inkLightStandIn(view, dom);
  const drawing = inkLayerDrawingOf(dom);
  if (drawing) return layerStandIn(dom, drawing);
  return dom.querySelector<HTMLElement>(SHAPE_CANVAS_SELECTOR);
}

function layerStandIn(stroke: HTMLElement, drawing: Element): HTMLElement {
  const standIn = {
    getBoundingClientRect: () => drawing.getBoundingClientRect(),
    closest: (selector: string) => stroke.closest(selector),
    offsetWidth: 0,
    offsetHeight: 0,
    isConnected: true,
  };
  return standIn as unknown as HTMLElement;
}

/**
 * Every stroke on screen as a path in CLIENT pixels, so the erasers are
 * tested in the same space the pointer reports. The stroke's box on screen
 * already carries the editor zoom; the samples are fractions of it.
 */
export function documentInkPaths(view: EditorView): PersistedInkPath[] {
  const paths: PersistedInkPath[] = [];
  for (const { pos, node } of documentInkErasables(view.state.doc)) {
    const path = isDocumentInkShapeAttrs(node.attrs)
      ? documentInkPathAt(view, pos, node)
      : documentDrawnShapePathAt(view, pos, node);
    if (path) paths.push(path);
  }
  return paths;
}

/**
 * What a scribble to erase may take: every ink stroke, and the shapes and
 * highlighter strokes only while Erase shapes and highlighter is on
 * (lib/office-ink-scratch-out).
 */
export function documentInkScratchablePaths(view: EditorView): PersistedInkPath[] {
  const paths: PersistedInkPath[] = [];
  for (const { pos, node } of documentInkErasables(view.state.doc)) {
    const ink = isDocumentInkShapeAttrs(node.attrs);
    if (!inkScratchOutTakes({ tool: ink ? String(node.attrs.inkTool ?? "") : null, shape: !ink })) continue;
    const path = ink ? documentInkPathAt(view, pos, node) : documentDrawnShapePathAt(view, pos, node);
    if (path) paths.push(path);
  }
  return paths;
}







export function documentInkErasables(
  doc: ProseMirrorNode,
): Array<{ pos: number; node: ProseMirrorNode }> {
  const found: Array<{ pos: number; node: ProseMirrorNode }> = [];
  const handwriting = isHandwritingDocumentDoc(doc);
  doc.descendants((node, pos) => {
    if (node.type.name !== SHAPE_NODE_NAME) return true;
    if (isDocumentInkShapeAttrs(node.attrs) || isDocumentDrawnShapeNode(node, handwriting)) found.push({ pos, node });
    return false;
  });
  return found;
}

/** A handwriting document (lib/handwriting-paper): its page holds ink and objects only. */
export function isHandwritingDocumentDoc(doc: ProseMirrorNode): boolean {
  const value = doc.attrs.handwritingDocument as { version?: unknown } | null | undefined;
  return Boolean(value && typeof value === "object" && value.version === 1);
}

/**
 * Whether `node` is a shape a pen draws (an outline Ink to Shape makes), not
 * ink. In a handwriting document every object floating over the paper -- a
 * picture, the text box Ink to Text made, an equation's box -- is one too:
 * the eraser takes it whole in one touch and the lasso picks it, as
 * note-taking apps treat everything on the page.
 */
function isDocumentDrawnShapeNode(node: ProseMirrorNode, handwriting = false): boolean {
  if (node.type.name !== SHAPE_NODE_NAME || isDocumentInkShapeAttrs(node.attrs)) return false;
  if (handwriting && isHandwritingObjectNode(node)) return true;
  return documentDrawnShapeOutline(node.attrs, node.childCount > 0) !== null;
}

function isHandwritingObjectNode(node: ProseMirrorNode): boolean {
  return node.attrs.wrapMode === "inFrontOfText" && !isDocumentInkShapeAttrs(node.attrs);
}

/**
 * A whole object as a path the erasers and the lasso test: lines across its
 * box close enough together that any touch inside it meets one, so a touch
 * anywhere on a picture or a text box takes it (a frame alone was met only
 * at its edge).
 */
function documentObjectBoxFractions(heightPx: number): Array<{ x: number; y: number }> {
  const rows = Math.max(1, Math.min(160, Math.ceil(heightPx / 5)));
  const points: Array<{ x: number; y: number }> = [];
  for (let row = 0; row <= rows; row += 1) {
    const y = row / rows;
    points.push(row % 2 === 0 ? { x: 0, y } : { x: 1, y }, row % 2 === 0 ? { x: 1, y } : { x: 0, y });
  }
  return points;
}

/**
 * The drawn shape `node` at `pos` as its outline in client pixels (turned
 * as it is turned), with the outline's painted width; null off screen.
 */
function documentDrawnShapePathAt(view: EditorView, pos: number, node: ProseMirrorNode): PersistedInkPath | null {
  const canvas = documentInkCanvas(view, pos);
  const outline =
    documentDrawnShapeOutline(node.attrs, node.childCount > 0) ??
    (canvas && isHandwritingDocumentDoc(view.state.doc) && isHandwritingObjectNode(node)
      ? documentObjectBoxFractions(canvas.getBoundingClientRect().height)
      : null);
  if (!outline || !canvas) return null;
  const rect = canvas.getBoundingClientRect();
  // A level or upright line's box is zero across: only both empty is off screen.
  if (!(rect.width > 0) && !(rect.height > 0)) return null;
  const turn = ((Number(node.attrs.rotation) || 0) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  // The box's own size on screen: the rectangle on screen is the turned
  // box's bounds, so the scale is read back through the turn.
  const ownWidth = canvas.offsetWidth;
  const ownHeight = canvas.offsetHeight;
  const across = ownWidth * Math.abs(cos) + ownHeight * Math.abs(sin);
  const scale = across > 0 ? rect.width / across : ownWidth > 0 ? rect.width / ownWidth : 1;
  const width = ownWidth > 0 || turn !== 0 ? ownWidth * scale : rect.width;
  const height = ownHeight > 0 || turn !== 0 ? ownHeight * scale : rect.height;
  const frame = {
    left: rect.left + rect.width / 2 - width / 2,
    top: rect.top + rect.height / 2 - height / 2,
    width,
    height,
    rotation: node.attrs.rotation,
  };
  // The outline already holds the mirror (documentDrawnShapeOutline).
  const points = outline.map((point) => officeFramePlace(frame, point.x, point.y, { mirrored: false }));
  const outlinePt = Number(node.attrs.outlineWidthPt);
  const painted = outlinePt > 0 ? (ptToPx(outlinePt)) * (scale || 1) : undefined;
  return { id: String(pos), points, ...(painted ? { width: painted } : {}) };
}

/** The stroke `node` at `pos` as a path in client pixels; null when it is not on screen. */
function documentInkPathAt(view: EditorView, pos: number, node: ProseMirrorNode): PersistedInkPath | null {
  const canvas = documentInkCanvas(view, pos);
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  // The stroke as it is drawn: mirrored and turned about its box's centre.
  // Read through the box's rectangle alone, a turned stroke was erased where
  // it had been before the turn (WUA 211).
  const turn = ((Number(node.attrs.rotation) || 0) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const ownWidth = canvas.offsetWidth;
  const ownHeight = canvas.offsetHeight;
  const across = ownWidth * Math.abs(cos) + ownHeight * Math.abs(sin);
  const scale = across > 0 ? rect.width / across : ownWidth > 0 ? rect.width / ownWidth : 1;
  const boxWidth = ownWidth > 0 && turn !== 0 ? ownWidth * scale : rect.width;
  const boxHeight = ownHeight > 0 && turn !== 0 ? ownHeight * scale : rect.height;
  const frame = {
    left: rect.left + rect.width / 2 - boxWidth / 2,
    top: rect.top + rect.height / 2 - boxHeight / 2,
    width: boxWidth,
    height: boxHeight,
    rotation: node.attrs.rotation,
    flipH: node.attrs.flipH,
    flipV: node.attrs.flipV,
  };
  const points = documentInkPathFractions(node.attrs).map((point) => officeFramePlace(frame, point.x, point.y));
  if (points.length === 0) return null;
  // The painted width on screen, so the erasers meet the visible line:
  // the pen's points at the box's own on-screen scale.
  const widthEmu = Number(node.attrs.widthEmu);
  const style = documentInkStrokeStyle(node.attrs);
  const width =
    style && widthEmu > 0 ? (style.widthPt * EMU_PER_PT * boxWidth) / widthEmu : undefined;
  const cutEnds = normalizeInkCutEnds(node.attrs.inkCutEnds);
  return { id: String(pos), points, ...(width ? { width } : {}), ...(cutEnds ? { cutEnds } : {}) };
}

export interface InkStrokeOrigin {
  /** Where the stroke's shape node is inserted: before this block. */
  readonly insertPos: number;
  /** The column's left edge on screen: the anchor's horizontal origin. */
  readonly columnLeftClient: number;
  /** The anchor paragraph's top on screen: the anchor's vertical origin. */
  readonly blockTopClient: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** The page holds no text block: a paragraph is made at `insertPos`, after the stroke, to anchor it. */
  readonly createParagraph?: boolean;
}

/**
 * Where a stroke inserted before `blockDom` is measured from: the stroke's
 * own place in the flow, which is NOT the block's top when the block has
 * space before it. The stroke's node is an empty box, so it stands where the
 * space before the block begins (under the previous block's space after,
 * which it does not collapse past), and the block keeps its space below it.
 * Measuring from the block's top instead lifted a stroke drawn over a heading
 * by the heading's space before, off the top of the page.
 */
function inkAnchorTopClient(blockDom: HTMLElement, blockRect: DOMRect, scaleY: number): number {
  const view = blockDom.ownerDocument.defaultView;
  if (!view) return blockRect.top;
  const px = (value: string) => Number.parseFloat(value) || 0;
  for (
    let previous = blockDom.previousElementSibling;
    previous;
    previous = previous.previousElementSibling
  ) {
    if (!(previous instanceof HTMLElement)) continue;
    const style = view.getComputedStyle(previous);
    if (style.display === "none" || style.position === "absolute" || style.position === "fixed") {
      continue;
    }
    const rect = previous.getBoundingClientRect();
    return rect.bottom + Math.max(0, px(style.marginBottom)) * scaleY;
  }
  return blockRect.top - Math.max(0, px(view.getComputedStyle(blockDom).marginTop)) * scaleY;
}

/**
 * The block whose box says where the column is: `blockDom` itself when it
 * stands in the flow, else the nearest sibling that does. A floating
 * picture's wrapper is not where its anchor stands -- "In Front of Text" it
 * is positioned absolutely at the picture's offsets, Square it is a CSS
 * float at the column's far side -- and a press over it (the crosshair, a
 * stroke) measured the column from the picture's own left edge, throwing the
 * new shape left by the picture's offset.
 */
function inFlowColumnBlockDom(blockDom: HTMLElement): HTMLElement {
  const view = blockDom.ownerDocument.defaultView;
  if (!view) return blockDom;
  const outOfFlow = (element: HTMLElement) => {
    const style = view.getComputedStyle(element);
    return (
      style.position === "absolute" ||
      style.position === "fixed" ||
      style.float !== "none" ||
      style.display === "none"
    );
  };
  if (!outOfFlow(blockDom)) return blockDom;
  for (let next = blockDom.nextElementSibling; next; next = next.nextElementSibling) {
    if (next instanceof HTMLElement && !outOfFlow(next)) return next;
  }
  for (
    let previous = blockDom.previousElementSibling;
    previous;
    previous = previous.previousElementSibling
  ) {
    if (previous instanceof HTMLElement && !outOfFlow(previous)) return previous;
  }
  return blockDom;
}

/** The origins of the top-level block at `insertPos`, on screen. */
function inkOriginOfBlock(view: EditorView, insertPos: number): InkStrokeOrigin | null {
  const block = view.state.doc.nodeAt(insertPos);
  if (!block || !block.isBlock) return null;
  const blockDom = view.nodeDOM(insertPos);
  if (!(blockDom instanceof HTMLElement)) return null;
  const sheet = blockDom.closest<HTMLElement>(PAGE_SHEET_SELECTOR) ?? view.dom;
  const scale = documentViewScale(sheet);
  const sheetRect = sheet.getBoundingClientRect();
  const paddingLeft = Number.parseFloat(getComputedStyle(sheet).paddingLeft) || 0;
  // The stroke's node stands at its column's left edge, which is the block's
  // MARGIN edge, not its own: an indented paragraph or a centred table starts
  // further in, and measuring from there threw the stroke left by the indent.
  // In a column layout that margin edge is the column's. A block out of the
  // flow (a floating picture) answers with the in-flow block beside it.
  const blockRect = blockDom.getBoundingClientRect();
  const columnDom = inFlowColumnBlockDom(blockDom);
  const columnRect = columnDom === blockDom ? blockRect : columnDom.getBoundingClientRect();
  const marginLeft = Number.parseFloat(getComputedStyle(columnDom).marginLeft) || 0;
  const columnLeftClient = Math.max(
    sheetRect.left + paddingLeft * scale.scaleX,
    columnRect.left - marginLeft * scale.scaleX,
  );
  return {
    insertPos,
    columnLeftClient,
    blockTopClient: inkAnchorTopClient(blockDom, blockRect, scale.scaleY || 1),
    scaleX: scale.scaleX || 1,
    scaleY: scale.scaleY || 1,
  };
}

/** The top-level block a document position belongs to (a list as a whole). */
function inkAnchorBlockPos(view: EditorView, pos: number): number | null {
  const { doc } = view.state;
  const $pos = doc.resolve(Math.max(0, Math.min(doc.content.size, pos)));
  let insertPos: number | null = documentShapeBoundaryOutsideList($pos, "before");
  if (insertPos === null) {
    if ($pos.depth >= 2) insertPos = $pos.before(2);
    else if ($pos.depth === 1 && $pos.nodeAfter) insertPos = $pos.pos;
    else if ($pos.depth === 1 && $pos.nodeBefore)
      insertPos = $pos.pos - $pos.nodeBefore.nodeSize;
    else return null;
  }
  return insertPos;
}

/**
 * The paragraph a stroke is anchored to: the top-level block under the first
 * sample (a stroke on a list line anchors beside the whole list, as a shape
 * moved there does), and the origins its offsets are measured from.
 */
/**
 * Where a stroke beginning at `first` (client pixels) is measured from when
 * it lands: its column's left and its anchor block's top, in client pixels,
 * as insertDocumentInkStrokes reads them. The stroke being written is
 * painted from the same origin (DocumentInkSurface), so its box falls on the
 * same grid as the landed stroke's.
 */
export function documentInkLandingOrigin(
  view: EditorView,
  first: DocumentInkClientPoint,
): { columnLeftClient: number; blockTopClient: number } | null {
  const piece = inkStrokePieces(view, [first])[0];
  const origin = inkStrokeOrigin(view, first, piece?.sheet ?? null);
  return origin ? { columnLeftClient: origin.columnLeftClient, blockTopClient: origin.blockTopClient } : null;
}

/**
 * The page column's padding-box corner in client pixels: a landed stroke's
 * drawing starts on a whole pixel from it (floatingTextBoxLayout
 * `inkStageOnWholePixels`), and so does the stroke being written.
 */
export function documentInkColumnCornerClient(view: EditorView): { x: number; y: number; scale: number } | null {
  const column = (view.dom as HTMLElement).closest<HTMLElement>('[data-testid="note-editor-page-surface"]');
  if (!column) return null;
  const rect = column.getBoundingClientRect();
  const scale = column.offsetWidth > 0 ? rect.width / column.offsetWidth : 1;
  return { x: rect.left + column.clientLeft * scale, y: rect.top + column.clientTop * scale, scale: scale || 1 };
}

function inkStrokeOrigin(
  view: EditorView,
  first: DocumentInkClientPoint,
  sheet: HTMLElement | null = null,
): InkStrokeOrigin | null {
  const hit = view.posAtCoords({ left: first.x, top: first.y });
  let insertPos = hit ? inkAnchorBlockPos(view, hit.pos) : null;
  // A stroke is anchored on the page it is drawn on: written in a page's
  // top or bottom margin (its header or footer area), the nearest text can
  // be the other page's, and the stroke was drawn from there, a page away.
  // And to a block of the text: never to a page break (one that starts a
  // page took the strokes back onto the page before it, under the next
  // sheet), nor to another drawing.
  // Over a drawing or a break: the text block after it (else before it).
  if (insertPos !== null && !inkAnchorableBlock(view.state.doc.nodeAt(insertPos))) {
    insertPos = inkNearestAnchorableBlock(view.state.doc, insertPos);
  }
  const anchorable = insertPos !== null;
  if (sheet && (insertPos === null || !anchorable || !inkBlockOnSheet(view, insertPos, sheet))) {
    const edge = inkSheetEdgeBlockPos(view, sheet, first.y);
    if (edge === "none") return inkSheetParagraphOrigin(view, sheet);
    insertPos = edge ?? (anchorable ? insertPos : null);
  } else if (!anchorable) {
    insertPos = null;
  }
  return insertPos === null ? null : inkOriginOfBlock(view, insertPos);
}

/** The nodes a stroke group lands as: with the paragraph a page with no text block needs, after them. */
function inkGroupWithParagraph(schema: Schema, origin: InkStrokeOrigin, nodes: readonly ProseMirrorNode[]): ProseMirrorNode[] {
  const paragraph = schema.nodes.paragraph;
  return origin.createParagraph && paragraph
    ? [...nodes, paragraph.create({ [MRNOTE_BLOCK_ID_ATTR]: mintFreshBlockId() })]
    : [...nodes];
}

/** The block of the text nearest the block at `pos` among its siblings: the next one, else the one before. */
function inkNearestAnchorableBlock(doc: ProseMirrorNode, pos: number): number | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  const index = $pos.index();
  const start = $pos.start();
  const offsets: number[] = [];
  parent.forEach((_child, offset) => offsets.push(offset));
  for (let at = index + 1; at < parent.childCount; at += 1) {
    if (inkAnchorableBlock(parent.child(at))) return start + offsets[at]!;
  }
  for (let at = index - 1; at >= 0; at -= 1) {
    if (inkAnchorableBlock(parent.child(at))) return start + offsets[at]!;
  }
  return null;
}

/** Blocks a drawing never anchors to: breaks, and the drawings themselves. */
const INK_UNANCHORABLE_BLOCKS = new Set(["pageBreak", "columnBreak", "sectionBreak", "sourcePageBreak"]);

/** Whether a stroke (or a moved object) may be anchored to `node`: a block of the text. */
function inkAnchorableBlock(node: ProseMirrorNode | null | undefined): boolean {
  if (!node || INK_UNANCHORABLE_BLOCKS.has(node.type.name)) return false;
  const attrs = node.attrs as { wrapMode?: unknown; floatAnchor?: unknown };
  if (node.type.name === SHAPE_NODE_NAME) return attrs.wrapMode === "inline";
  if ((node.type.name === "textBox" || node.type.name === "image") && attrs.floatAnchor) return false;
  return true;
}

/**
 * The anchor a stroke takes on a page that holds no text block (only a
 * break, or only drawings): Word's page always has a paragraph there -- a
 * break's own paragraph mark -- so one is made at the top of the page, in
 * the same step as the stroke, and the stroke anchored to it. Measured from
 * the page's column top-left, where that paragraph will stand.
 */
function inkSheetParagraphOrigin(view: EditorView, sheet: HTMLElement): InkStrokeOrigin | null {
  let insertPos: number | null = null;
  view.state.doc.forEach((page, offset) => {
    if (insertPos === null && view.nodeDOM(offset) === sheet) insertPos = offset + 1;
  });
  if (insertPos === null) return null;
  const scale = documentViewScale(sheet);
  const rect = sheet.getBoundingClientRect();
  const style = getComputedStyle(sheet);
  return {
    insertPos,
    columnLeftClient: rect.left + (Number.parseFloat(style.paddingLeft) || 0) * (scale.scaleX || 1),
    blockTopClient: rect.top + (Number.parseFloat(style.paddingTop) || 0) * (scale.scaleY || 1),
    scaleX: scale.scaleX || 1,
    scaleY: scale.scaleY || 1,
    createParagraph: true,
  };
}

function inkBlockOnSheet(view: EditorView, insertPos: number, sheet: HTMLElement): boolean {
  const dom = view.nodeDOM(insertPos);
  return dom instanceof Node && sheet.contains(dom);
}

/**
 * The block on `sheet` a stroke at client `y` anchors to when no text under
 * it does: the page's first block above its middle, its last below.
 */
function inkSheetEdgeBlockPos(view: EditorView, sheet: HTMLElement, y: number): number | "none" | null {
  let found: number | "none" | null = null;
  view.state.doc.forEach((page, offset) => {
    if (found !== null || view.nodeDOM(offset) !== sheet) return;
    // The page's first block of the text above its middle, its last below.
    const anchorable: number[] = [];
    page.forEach((child, childOffset) => {
      if (inkAnchorableBlock(child)) anchorable.push(offset + 1 + childOffset);
    });
    if (anchorable.length === 0) {
      found = "none";
      return;
    }
    const rect = sheet.getBoundingClientRect();
    found = y < rect.top + rect.height / 2 ? anchorable[0]! : anchorable[anchorable.length - 1]!;
  });
  return found;
}

/**
 * Where a floating object whose top-left corner is at `point` (client
 * pixels) is anchored, as Word re-anchors a moved object: the paragraph on
 * the page under it, measured as a stroke landing there is (the block it is
 * inserted before, its column's left and its top on screen). A point between
 * or beside the pages is taken to the nearest page. Null when nothing is laid
 * out to anchor to.
 */
export function documentFloatAnchorTarget(
  view: EditorView,
  point: DocumentInkClientPoint,
  pagePoint: DocumentInkClientPoint = point,
): (InkStrokeOrigin & { readonly sheet: HTMLElement | null }) | null {
  const page = documentInkPageAt(view, pagePoint);
  // No page laid out (a headless DOM): nothing to measure a new anchor by.
  if (page === undefined) return null;
  // The page is the one `pagePoint` is over (a moved object's centre: the
  // page most of it stands on), or the nearest; `point` (its top-left
  // corner) is taken onto that page to find the paragraph there. Picked by
  // the corner, an object dropped with its corner 30px above a seam stayed
  // on the page above, drawn under the next page's paper (WebKit, owner's
  
  let sheet: HTMLElement | null = page ? documentInkSheetAt(view, pagePoint) : null;
  if (!sheet) {
    let best: { sheet: HTMLElement; distance: number } | null = null;
    for (const candidate of pageSheetsOf(view)) {
      const rect = candidate.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) continue;
      const dx = Math.max(rect.left - pagePoint.x, 0, pagePoint.x - rect.right);
      const dy = Math.max(rect.top - pagePoint.y, 0, pagePoint.y - rect.bottom);
      const distance = Math.hypot(dx, dy);
      if (!best || distance < best.distance) best = { sheet: candidate, distance };
    }
    if (!best) return null;
    sheet = best.sheet;
  }
  const rect = sheet.getBoundingClientRect();
  const at = {
    x: Math.min(rect.right - 1, Math.max(rect.left + 1, point.x)),
    y: Math.min(rect.bottom - 1, Math.max(rect.top + 1, point.y)),
  };
  // Word anchors a moved object to the paragraph whose line holds its top
  // edge: the last paragraph of the page that starts at or above it (the
  // page's first when the edge is above them all). Taken from under the
  // point instead, an edge in the space between two paragraphs went to the
  // one below, and the offset came out negative.
  if (sheet) {
    const blocks = inkSheetAnchorableBlocks(view, sheet);
    if (blocks.length > 0) {
      const index = lastBlockAtOrAbove(blocks.map((block) => block.top), at.y);
      const origin = inkOriginOfBlock(view, blocks[index]!.pos);
      if (origin) return { ...origin, sheet };
    }
  }
  const origin = inkStrokeOrigin(view, at, sheet);
  return origin ? { ...origin, sheet } : null;
}

/** The blocks of the text on `sheet`, in order, with their tops on screen. */
function inkSheetAnchorableBlocks(view: EditorView, sheet: HTMLElement): Array<{ pos: number; top: number }> {
  const blocks: Array<{ pos: number; top: number }> = [];
  view.state.doc.forEach((page, offset) => {
    if (view.nodeDOM(offset) !== sheet) return;
    page.forEach((child, childOffset) => {
      if (!inkAnchorableBlock(child)) return;
      const pos = offset + 1 + childOffset;
      const dom = view.nodeDOM(pos);
      if (dom instanceof HTMLElement) blocks.push({ pos, top: dom.getBoundingClientRect().top });
    });
  });
  return blocks;
}

/**
 * The index of the block of `tops` (in document order) that starts nearest
 * at or above `y`; the first when `y` is above them all.
 */
export function lastBlockAtOrAbove(tops: readonly number[], y: number): number {
  // The nearest top at or above `y` (in columns the tops do not rise in order).
  let found = -1;
  for (let index = 0; index < tops.length; index += 1) {
    if (tops[index]! <= y && (found < 0 || tops[index]! >= tops[found]!)) found = index;
  }
  return Math.max(0, found);
}

/**
 * A stroke at `points` (client pixels, with their pressures) landed again in
 * the pen `style`: one node per page it crosses, each anchored to the
 * paragraph its piece is on, exactly as a stroke drawn there lands. A moved
 * stroke that ends up over a page seam is cut there as one drawn so is.
 */
export function documentInkRelandPieces(
  view: EditorView,
  points: readonly DocumentInkClientPoint[],
  style: DocumentInkStrokeStyle,
  relativeHeight: number,
): Array<{ insertPos: number; nodes: ProseMirrorNode[] }> {
  const out: Array<{ insertPos: number; nodes: ProseMirrorNode[] }> = [];
  // No page laid out (a headless DOM): the stroke stays as it was moved.
  if (points.length === 0 || documentInkPageAt(view, points[0]!) === undefined) return out;
  for (const piece of inkStrokePieces(view, points)) {
    const origin = inkStrokeOrigin(view, piece.runs[0][0], piece.sheet);
    if (!origin) continue;
    const nodes = inkStrokeNodes(view, origin, piece.runs, style, relativeHeight, {});
    if (nodes.length > 0) out.push({ insertPos: origin.insertPos, nodes: inkGroupWithParagraph(view.state.schema, origin, nodes) });
  }
  return out;
}

/** The client-pixel path of the ink stroke at `pos` as it is drawn now (its pressures with it). */
export function documentInkClientPath(view: EditorView, pos: number): DocumentInkClientPoint[] | null {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !isDocumentInkShapeAttrs(node.attrs)) return null;
  const canvas = documentInkCanvas(view, pos);
  const rect = canvas?.getBoundingClientRect();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  const points = documentInkPathFractions(node.attrs).map((point) => ({
    x: rect.left + point.x * rect.width,
    y: rect.top + point.y * rect.height,
    ...(point.p !== undefined ? { p: point.p } : {}),
  }));
  return points.length > 0 ? points : null;
}

/** The origins of the block at `insertPos` on screen (see {@link documentFloatAnchorTarget}). */
export function documentFloatOriginOfBlock(view: EditorView, insertPos: number): InkStrokeOrigin | null {
  return inkOriginOfBlock(view, insertPos);
}






function inkRunsBySheet(
  view: EditorView,
  points: readonly DocumentInkClientPoint[],
): Array<{ sheet: HTMLElement; runs: DocumentInkClientPoint[][] }> | undefined {
  const sheets = pageSheetsOf(view);
  const laidOut = sheets.filter((sheet) => {
    const rect = sheet.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (laidOut.length === 0) return undefined;
  const out: Array<{ sheet: HTMLElement; runs: DocumentInkClientPoint[][] }> = [];
  for (const sheet of laidOut) {
    const rect = sheet.getBoundingClientRect();
    const runs = documentInkRunsInside(points, {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    }).filter((run) => run.length > 1 || points.length === 1);
    // A piece that only grazes the seam (the stroke's point on the line itself) is the other page's.
    const long = runs.filter((run) => run.length === 1 || run.some((point) => point.y > rect.top + 0.5 && point.y < rect.bottom - 0.5));
    if (long.length > 0) out.push({ sheet, runs: long });
  }
  return out;
}

/** How a finished stroke lands: as ink, or (Draw ▸ Ink to Shape) as the shape it plainly is. */
export interface DocumentInkStrokeOptions {
  readonly toShape?: boolean;
  /** Drawn and held (lib/office-ink-hold-shape): the stroke is a shape the writer asked for. */
  readonly held?: boolean;
  /**
   * The ink strokes the gesture left, as they stand in the document once
   * the insertion is dispatched (Ink to Math / Ink to Text group them).
   */
  readonly onInserted?: (strokes: readonly ProseMirrorNode[]) => void;
  /** Draw ▸ Record: the recording and the moment, `"<id> <ms>"` (`inkAudio`). */
  readonly audio?: string;
}

/**
 * The anchor a shape the stroke became floats by: the stroke's own (where it
 * is anchored, how it wraps) with the SHAPE's box, mirror and turn. The
 * stroke's anchor states its padded box and no mirror; kept whole, it drew a
 * line drawn up to the right as one running down (its flip lost) and the
 * line's box as the stroke's.
 */
function shapeFloatAnchorFrom(
  shape: { readonly xEmu: number; readonly yEmu: number; readonly widthEmu: number; readonly heightEmu: number; readonly flipH?: boolean; readonly flipV?: boolean; readonly rotation?: number },
  base: unknown,
): unknown {
  if (!base || typeof base !== "object") return base;
  const anchor = base as Record<string, unknown> & {
    horizontal?: Record<string, unknown>;
    vertical?: Record<string, unknown>;
  };
  return {
    ...anchor,
    ...(anchor.horizontal ? { horizontal: { ...anchor.horizontal, offsetEmu: shape.xEmu } } : {}),
    ...(anchor.vertical ? { vertical: { ...anchor.vertical, offsetEmu: shape.yEmu } } : {}),
    widthEmu: shape.widthEmu,
    heightEmu: shape.heightEmu,
    flipH: shape.flipH === true,
    flipV: shape.flipV === true,
    rotation: shape.rotation ?? 0,
  };
}

/** The shape nodes one gesture's runs land as (ink, or the shape a run plainly is). */
function inkStrokeNodes(
  view: EditorView,
  origin: InkStrokeOrigin,
  runs: readonly (readonly DocumentInkClientPoint[])[],
  preset: DocumentInkStrokeStyle,
  relativeHeight: number,
  options: DocumentInkStrokeOptions,
): ProseMirrorNode[] {
  const shapeType = view.state.schema.nodes[SHAPE_NODE_NAME];
  if (!shapeType) return [];
  return runs
    .map((points) => {
      // The pen's pressure goes with each point (the stroke's `inkPressure`).
      const pointsEmu = points.map((point) => ({
        x: ((point.x - origin.columnLeftClient) / origin.scaleX) * DOCUMENT_SHAPE_EMU_PER_PX,
        y: ((point.y - origin.blockTopClient) / origin.scaleY) * DOCUMENT_SHAPE_EMU_PER_PX,
        ...(point.p !== undefined ? { p: point.p } : {}),
      }));
      // Ink to Shape: a stroke that plainly is a shape lands as that shape,
      // anchored and floated exactly as the stroke would have been; anything
      // else stays ink (Microsoft Support, "Convert your ink to shapes").
      const fitted = options.toShape
        ? documentShapeFromInkStroke(pointsEmu, preset, relativeHeight, { held: options.held })
        : null;
      if (fitted) {
        const stroke = documentInkStrokeAttrs(pointsEmu, preset, relativeHeight);
        return stroke ? { ...fitted, floatAnchor: shapeFloatAnchorFrom(fitted, stroke.floatAnchor) } : fitted;
      }
      const stroke = documentInkStrokeAttrs(pointsEmu, preset, relativeHeight);
      // Written while the Draw tab recorded: the recording and the moment.
      return stroke && options.audio ? { ...stroke, inkAudio: options.audio } : stroke;
    })
    .filter((attrs): attrs is NonNullable<typeof attrs> => attrs !== null)
    // Each stroke with an identity of its own from the start: without one the
    // block-id plugin walked every block of the document after each landing
    // to give it one, and appended a second transaction every other plugin
    // and the room bridge then ran over again (blockIds landsWithFreshIds).
    .map((attrs) => shapeType.createChecked({ ...attrs, [MRNOTE_BLOCK_ID_ATTR]: mintFreshBlockId() }));
}

function insertInkStrokeAtOrigin(
  view: EditorView,
  origin: InkStrokeOrigin,
  runs: readonly (readonly DocumentInkClientPoint[])[],
  preset: DocumentInkStrokeStyle,
  revealCaret: boolean,
  options: DocumentInkStrokeOptions = {},
  sheet: HTMLElement | null = null,
): boolean {
  const shapeType = view.state.schema.nodes[SHAPE_NODE_NAME];
  if (!shapeType) return false;
  const nodes = inkStrokeNodes(view, origin, runs, preset, nextRelativeHeight(view.state.doc), options);
  if (nodes.length === 0) return false;
  const $insert = view.state.doc.resolve(origin.insertPos);
  if (!$insert.parent.canReplaceWith($insert.index(), $insert.index(), shapeType)) {
    return false;
  }
  const transaction = closeHistory(
    view.state.tr.insert(origin.insertPos, inkGroupWithParagraph(view.state.schema, origin, nodes)),
  ).setMeta(DOCUMENT_INK_LANDING_META, true);
  keepWritingPageAfterInk(view, transaction, [sheet]);
  // The caret stays where it was, so scrolling the selection into view
  // scrolls to the caret, not to the ink: a stroke drawn at the top of the
  // document jumped the view pages down to a caret left further on.
  view.dispatch(revealCaret ? transaction.scrollIntoView() : transaction);
  if (options.onInserted) {
    // Read back after the dispatch: appended transactions (block ids) may
    // have rewritten the nodes, and the group must match what is there.
    const inserted: ProseMirrorNode[] = [];
    let pos = origin.insertPos;
    for (const node of nodes) {
      const landed = view.state.doc.nodeAt(pos);
      if (landed && landed.type === shapeType && isDocumentInkShapeAttrs(landed.attrs)) {
        inserted.push(landed);
      }
      pos += node.nodeSize;
    }
    if (inserted.length) options.onInserted(inserted);
  }
  return true;
}








function keepWritingPageAfterInk(
  view: EditorView,
  transaction: Transaction,
  landedOn: Iterable<HTMLElement | null>,
): void {
  // A handwriting document keeps a fresh page of its paper after the last
  
  // last page added none, unlike a Docs page); Add Page still adds pages
  // anywhere, and the blank page copies the last page's paragraph, so it
  // wears the document's paper.
  const sheets = pageSheetsOf(view).filter((sheet) => sheet.getBoundingClientRect().height > 0);
  const lastSheet = sheets[sheets.length - 1];
  if (!lastSheet) return;
  let onLast = false;
  for (const sheet of landedOn) if (sheet === lastSheet) onLast = true;
  if (!onLast || !documentEndsOnSheet(view, lastSheet)) return;
  appendBlankPageAtDocumentEnd(transaction);
}

/**
 * Whether the document's end is laid out on `sheet`: the page laid out last
 * is not the document's last while a long document is still being laid out.
 */
function documentEndsOnSheet(view: EditorView, sheet: HTMLElement): boolean {
  try {
    const end = view.coordsAtPos(Selection.atEnd(view.state.doc).from);
    const rect = sheet.getBoundingClientRect();
    return end.top >= rect.top - 1 && end.bottom <= rect.bottom + 1;
  } catch {
    return false;
  }
}

/**
 * Insert several strokes at once, in one transaction and one history step:
 * the strokes a quick hand drew while the previous ones were still landing.
 * Each stroke is anchored and cut at its page edge exactly as
 * {@link insertDocumentInkStroke} anchors one; strokes that anchor to the
 * same block are inserted together, later blocks first so no position moves
 * under an earlier insertion. Each stroke stacks above the one before it.
 * One transaction for the batch costs what one stroke's did -- the
 * pagination, the save and the ribbon run once -- which is what lets the
 * pen keep up with fast writing.
 */
/**
 * Draw ▸ Tape: the strip of tape painted under a client point peels back
 * from the words or is laid over them again (a tap with the Tape tool, or on
 * the strip itself). A peek, not an edit: Undo goes on taking back the
 * writing. False when no strip is there (or the page cannot be written).
 */
export function flipDocumentInkTapeAt(view: EditorView, clientX: number, clientY: number): boolean {
  if (!view.editable) return false;
  const ownerDocument = view.dom.ownerDocument;
  for (const element of ownerDocument.elementsFromPoint?.(clientX, clientY) ?? []) {
    const strip = element.closest<HTMLElement>("[data-ink-tape]");
    if (!strip || !view.dom.contains(strip)) continue;
    let near: number;
    try {
      near = view.posAtDOM(strip, 0);
    } catch {
      continue;
    }
    for (const pos of [near, near - 1]) {
      const node = pos >= 0 ? view.state.doc.nodeAt(pos) : null;
      const tape = node ? normalizeInkTape(node.attrs.inkTape) : undefined;
      const dom = tape ? view.nodeDOM(pos) : null;
      if (!node || !tape || !(dom instanceof HTMLElement) || !dom.contains(strip)) continue;
      view.dispatch(
        view.state.tr
          .setNodeMarkup(pos, undefined, { ...node.attrs, inkTape: documentInkTapeFlipped(tape) })
          .setMeta("addToHistory", false)
          // ...but the page's to save: a strip left peeled back stays so.
          .setMeta(SAVED_WITHOUT_HISTORY_META, true),
      );
      return true;
    }
  }
  return false;
}

export function insertDocumentInkStrokes(
  view: EditorView,
  strokes: readonly (readonly DocumentInkClientPoint[])[],
  preset: DocumentInkStrokeStyle,
  options: DocumentInkStrokeOptions = {},
): boolean {
  const started = performance.now();
  try {
    return insertDocumentInkStrokesNow(view, strokes, preset, options);
  } finally {
    inkTraceWork("land", performance.now() - started);
  }
}

function insertDocumentInkStrokesNow(
  view: EditorView,
  strokes: readonly (readonly DocumentInkClientPoint[])[],
  preset: DocumentInkStrokeStyle,
  options: DocumentInkStrokeOptions,
): boolean {
  if (!view.editable || strokes.length === 0) return false;
  const shapeType = view.state.schema.nodes[SHAPE_NODE_NAME];
  if (!shapeType) return false;
  let relativeHeight = nextRelativeHeight(view.state.doc);
  const groups = new Map<number, { origin: InkStrokeOrigin; nodes: ProseMirrorNode[] }>();
  const sheets = new Set<HTMLElement | null>();
  for (const points of strokes) {
    if (points.length === 0) continue;
    for (const piece of inkStrokePieces(view, points)) {
      sheets.add(piece.sheet);
      const origin = inkStrokeOrigin(view, piece.runs[0][0], piece.sheet);
      if (!origin) continue;
      const nodes = inkStrokeNodes(view, origin, piece.runs, preset, relativeHeight, options);
      if (nodes.length === 0) continue;
      relativeHeight += nodes.length;
      const group = groups.get(origin.insertPos);
      if (group) group.nodes.push(...nodes);
      else groups.set(origin.insertPos, { origin, nodes });
    }
  }
  if (groups.size === 0) return false;
  const positions = [...groups.keys()].sort((a, b) => b - a);
  let transaction = view.state.tr;
  const placed: number[] = [];
  for (const insertPos of positions) {
    const $insert = view.state.doc.resolve(insertPos);
    if (!$insert.parent.canReplaceWith($insert.index(), $insert.index(), shapeType)) continue;
    const group = groups.get(insertPos)!;
    // A page with no text block gets the paragraph its strokes anchor to.
    transaction = transaction.insert(insertPos, inkGroupWithParagraph(view.state.schema, group.origin, group.nodes));
    placed.push(insertPos);
  }
  if (!transaction.docChanged) return false;
  keepWritingPageAfterInk(view, transaction, sheets);
  view.dispatch(closeHistory(transaction).setMeta(DOCUMENT_INK_LANDING_META, true));
  if (options.onInserted) {
    const inserted: ProseMirrorNode[] = [];
    // Read back after the dispatch, each group where it landed: the groups
    // went in from the last block up, so a group stands after every group
    // placed before it in the document -- its own position moved down by
    // theirs. (Read at its old position, a stroke anchored to a lower line
    // than another in the same batch -- an equation's superscript, its
    // limits -- was never handed to Ink to Math, and the writing stayed ink.)
    let shift = 0;
    for (const insertPos of [...placed].sort((a, b) => a - b)) {
      let pos = insertPos + shift;
      for (const node of groups.get(insertPos)!.nodes) {
        const landed = view.state.doc.nodeAt(pos);
        if (landed && landed.type === shapeType && isDocumentInkShapeAttrs(landed.attrs)) {
          inserted.push(landed);
        }
        pos += node.nodeSize;
        shift += node.nodeSize;
      }
      if (groups.get(insertPos)!.origin.createParagraph) shift += 2;
    }
    if (inserted.length) options.onInserted(inserted);
  }
  return true;
}

/**
 * Insert one stroke drawn with `preset` from pointer samples in client pixels,
 * cut at the edge of the page it starts on (a gesture that leaves the page and
 * comes back leaves one piece per pass over the page). One history step; the
 * caret stays where it was, and so does the view (Word never scrolls under the
 * pen: the stroke is where it was drawn, on screen).
 */
export function insertDocumentInkStroke(
  view: EditorView,
  points: readonly DocumentInkClientPoint[],
  preset: DocumentInkStrokeStyle,
  options: DocumentInkStrokeOptions = {},
): boolean {
  if (!view.editable || points.length === 0) return false;
  const pieces = inkStrokePieces(view, points);
  if (pieces.length > 1) return insertDocumentInkStrokes(view, [points], preset, options);
  const piece = pieces[0];
  if (!piece) return false;
  const origin = inkStrokeOrigin(view, piece.runs[0][0], piece.sheet);
  if (!origin) return false;
  return insertInkStrokeAtOrigin(view, origin, piece.runs, preset, false, options, piece.sheet);
}

/**
 * The pieces a stroke lands as: on the page it starts on, cut at that
 * page's edge; with the pages joined for drawing, on every page it crosses,
 * cut at each seam. No sheet laid out (no pages): the stroke whole.
 */
function inkStrokePieces(
  view: EditorView,
  points: readonly DocumentInkClientPoint[],
): Array<{ sheet: HTMLElement | null; runs: DocumentInkClientPoint[][] }> {
  const page = documentInkPageAt(view, points[0]);
  if (page === null) return [];
  if (page === undefined) return [{ sheet: null, runs: [[...points]] }];
  if (documentInkPagesJoined(view)) return inkRunsBySheet(view, points) ?? [];
  const sheet = documentInkSheetAt(view, points[0]);
  const runs = documentInkRunsInside(points, page);
  return runs.length > 0 ? [{ sheet, runs }] : [];
}

function documentInkSheetAt(view: EditorView, point: DocumentInkClientPoint): HTMLElement | null {
  for (const sheet of pageSheetsOf(view)) {
    const rect = sheet.getBoundingClientRect();
    if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
      return sheet;
    }
  }
  return null;
}

/**
 * The page sheet under a client point, which the pen inks on: Word neither
 * starts ink off the page nor carries it past the page edge. Null between or
 * beside the pages; undefined when no sheet is laid out (no pages, or a
 * headless DOM), where nothing clips.
 */
export function documentInkPageAt(
  view: EditorView,
  point: DocumentInkClientPoint,
): DocumentInkBounds | null | undefined {
  let laidOut = false;
  for (const sheet of pageSheetsOf(view)) {
    const rect = sheet.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) continue;
    laidOut = true;
    if (
      point.x >= rect.left &&
      point.x <= rect.right &&
      point.y >= rect.top &&
      point.y <= rect.bottom
    ) {
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }
  }
  return laidOut ? null : undefined;
}

/**
 * The page sheet Draw with Trackpad stands on: the one `area` (client pixels)
 * shows the most of. Null when no sheet is laid out in it.
 */
export function documentInkPageIn(
  view: EditorView,
  area: DocumentInkBounds,
): DocumentInkBounds | null {
  let best: DocumentInkBounds | null = null;
  let bestShown = 0;
  for (const sheet of pageSheetsOf(view)) {
    const rect = sheet.getBoundingClientRect();
    const shown =
      Math.max(0, Math.min(rect.right, area.right) - Math.max(rect.left, area.left)) *
      Math.max(0, Math.min(rect.bottom, area.bottom) - Math.max(rect.top, area.top));
    if (shown > bestShown) {
      bestShown = shown;
      best = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }
  }
  return best;
}

/**
 * Insert one stroke drawn on the trackpad pad (Word for Mac: Draw with
 * Trackpad): `points` are CSS pixels from the top-left of the paragraph the
 * caret is in, which is where the pad's origin lands, so revealing the caret
 * shows the stroke.
 */
export function insertDocumentInkStrokeAtCaret(
  view: EditorView,
  points: readonly DocumentInkPoint[],
  preset: DocumentInkStrokeStyle,
): boolean {
  if (!view.editable || points.length === 0) return false;
  const insertPos = inkAnchorBlockPos(view, view.state.selection.from);
  if (insertPos === null) return false;
  const origin = inkOriginOfBlock(view, insertPos);
  if (!origin) return false;
  return insertInkStrokeAtOrigin(
    view,
    origin,
    [
      points.map((point) => ({
        x: origin.columnLeftClient + point.x * origin.scaleX,
        y: origin.blockTopClient + point.y * origin.scaleY,
      })),
    ],
    preset,
    true,
  );
}

/** The strokes `ids` name, as positions, when the document is still `sourceDoc`. */
function inkPositions(
  view: EditorView,
  ids: Iterable<string>,
  sourceDoc: ProseMirrorNode,
): number[] | null {
  if (view.state.doc !== sourceDoc) return null;
  const positions: number[] = [];
  for (const id of ids) {
    const pos = Number(id);
    const node = Number.isInteger(pos) ? view.state.doc.nodeAt(pos) : null;
    if (
      !node ||
      node.type.name !== SHAPE_NODE_NAME ||
      !(isDocumentInkShapeAttrs(node.attrs) || isDocumentDrawnShapeNode(node, isHandwritingDocumentDoc(view.state.doc)))
    ) {
      return null;
    }
    positions.push(pos);
  }
  return positions.length ? positions : null;
}

/** Remove whole strokes in one history step (the Stroke Eraser). */
export function removeDocumentInk(
  view: EditorView,
  ids: ReadonlySet<string>,
  sourceDoc: ProseMirrorNode,
): boolean {
  if (!view.editable) return false;
  const positions = inkPositions(view, ids, sourceDoc);
  if (!positions) return false;
  let transaction = view.state.tr;
  for (const pos of positions.sort((a, b) => b - a)) {
    const node = view.state.doc.nodeAt(pos);
    if (node) transaction = transaction.delete(pos, pos + node.nodeSize);
  }
  view.dispatch(closeHistory(transaction).setMeta(DOCUMENT_INK_TAKEN_OUT_BY_READER_META, true));
  return true;
}

/**
 * Rub out part of strokes (the Small and Medium Erasers): each stroke in
 * `pieces` is replaced by the pieces the eraser left of it
 * (`documentInkEraserCut`), each one stroke with the pen the stroke stated,
 * its cut ends flat. One history step.
 */
export function eraseDocumentInkSegments(
  view: EditorView,
  pieces: ReadonlyMap<string, readonly DocumentInkStrokePiece[]>,
  sourceDoc: ProseMirrorNode,
): boolean {
  if (!view.editable) return false;
  const positions = inkPositions(view, pieces.keys(), sourceDoc);
  if (!positions) return false;
  const shapeType = view.state.schema.nodes[SHAPE_NODE_NAME];
  if (!shapeType) return false;
  let transaction = view.state.tr;
  let changed = false;
  for (const pos of positions.sort((a, b) => b - a)) {
    const node = view.state.doc.nodeAt(pos)!;
    const left = pieces.get(String(pos));
    if (!left) continue;
    if (!isDocumentInkShapeAttrs(node.attrs)) {
      // A drawn shape is one outline, not ink to cut: the eraser that
      // touches it takes all of it, as the stroke eraser does.
      transaction = transaction.delete(pos, pos + node.nodeSize);
      changed = true;
      continue;
    }
    const fractions = documentInkPathFractions(node.attrs);
    const style = documentInkStrokeStyle(node.attrs);
    if (!style || fractions.length === 0) continue;
    const { xEmu, yEmu, widthEmu, heightEmu, relativeHeight } = node.attrs as {
      xEmu: number;
      yEmu: number;
      widthEmu: number;
      heightEmu: number;
      relativeHeight?: number;
    };
    // The pieces keep the stroke as it is drawn: its mirror and turn go into
    // their points, and each piece is a plain stroke of its own (a cut turned
    // stroke's pieces sprang back to the unturned line, WUA 211).
    const frame = {
      left: xEmu,
      top: yEmu,
      width: widthEmu,
      height: heightEmu,
      rotation: node.attrs.rotation,
      flipH: node.attrs.flipH,
      flipV: node.attrs.flipV,
    };
    const samples = fractions.map((point) => officeFramePlace(frame, point.x, point.y));
    const remaining = left
      .map((piece) =>
        documentInkStrokeAttrs(
          documentInkPolylineBetween(samples, piece.from, piece.to),
          style,
          relativeHeight ?? DOCUMENT_SHAPE_DEFAULT_RELATIVE_HEIGHT,
          piece.cutEnds,
        ),
      )
      .filter((attrs): attrs is NonNullable<typeof attrs> => attrs !== null)
      .map((attrs) => shapeType.createChecked(attrs));
    transaction = transaction.replaceWith(pos, pos + node.nodeSize, remaining);
    changed = true;
  }
  if (!changed) return false;
  view.dispatch(closeHistory(transaction).setMeta(DOCUMENT_INK_TAKEN_OUT_BY_READER_META, true));
  return true;
}

/**
 * Draw ▸ Ink to Shape over strokes already on the page: each selected ink
 * stroke that plainly is a shape becomes it, in place in the floating stack
 * (its anchor and height kept); the rest stay ink. False when none converted.
 */
export function convertDocumentInkToShapes(view: EditorView, positions: readonly number[]): boolean {
  const shapeType = view.state.schema.nodes[SHAPE_NODE_NAME];
  if (!shapeType || !view.editable) return false;
  let transaction = view.state.tr;
  let changed = false;
  let first: number | null = null;
  for (const pos of [...positions].sort((a, b) => b - a)) {
    const node = view.state.doc.nodeAt(pos);
    if (!node || node.type !== shapeType || !isDocumentInkShapeAttrs(node.attrs)) continue;
    const fractions = documentInkPathFractions(node.attrs);
    const style = documentInkStrokeStyle(node.attrs);
    if (!style || fractions.length < 2) continue;
    const { xEmu, yEmu, widthEmu, heightEmu, relativeHeight, floatAnchor } = node.attrs as {
      xEmu: number;
      yEmu: number;
      widthEmu: number;
      heightEmu: number;
      relativeHeight?: number;
      floatAnchor?: unknown;
    };
    const fitted = documentShapeFromInkStroke(
      fractions.map((point) => ({ x: xEmu + point.x * widthEmu, y: yEmu + point.y * heightEmu })),
      style,
      relativeHeight ?? DOCUMENT_SHAPE_DEFAULT_RELATIVE_HEIGHT,
      { stored: true },
    );
    if (!fitted) continue;
    transaction = transaction.setNodeMarkup(pos, undefined, {
      ...fitted,
      ...(floatAnchor ? { floatAnchor: shapeFloatAnchorFrom(fitted, floatAnchor) } : {}),
    });
    changed = true;
    first = pos;
  }
  if (!changed || first === null) return false;
  // The shape made is selected, as Word leaves it. The caret otherwise stays
  // wherever it was before drawing (often the document's start), and on an
  
  
  // changes keep positions, so `first` is still the shape.
  transaction = transaction.setSelection(NodeSelection.create(transaction.doc, first));
  view.dispatch(closeHistory(transaction).setMeta(DOCUMENT_INK_TAKEN_OUT_BY_READER_META, true));
  return true;
}

/**
 * Where the strokes of one piece of writing stand now, found by what they
 * are (a stroke's attributes are its identity: its outline and anchor),
 * since the document may have moved them. Null when any of them is gone or
 * changed (erased, rubbed out, moved): that writing is no longer what was read.
 */
export function documentInkPositionsOf(
  doc: ProseMirrorNode,
  strokes: readonly ProseMirrorNode[],
): number[] | null {
  if (strokes.length === 0) return null;
  const present = documentInkStrokes(doc);
  const positions: number[] = [];
  const used = new Set<number>();
  for (const stroke of strokes) {
    const hit = present.find(
      ({ pos, node }) => !used.has(pos) && (node === stroke || node.eq(stroke)),
    );
    if (!hit) return null;
    used.add(hit.pos);
    positions.push(hit.pos);
  }
  return positions;
}

/** The strokes at `positions` as their samples on screen (client pixels); null when one is not laid out. */
export function documentInkClientStrokes(
  view: EditorView,
  positions: readonly number[],
): DocumentInkClientPoint[][] | null {
  // Only the strokes asked for are measured (Ink to Text measures its pieces
  // of writing on every stroke that lands).
  const strokes: DocumentInkClientPoint[][] = [];
  for (const pos of positions) {
    const node = view.state.doc.nodeAt(pos);
    const path = node && node.type.name === SHAPE_NODE_NAME && isDocumentInkShapeAttrs(node.attrs)
      ? documentInkPathAt(view, pos, node)
      : null;
    if (!path) return null;
    strokes.push(path.points.map((point) => ({ x: point.x, y: point.y })));
  }
  return strokes;
}

/**
 * The strokes at `positions` as painted on screen (client pixels, colour and
 * painted width), for Ink to Text / Ink to Math's motion. Null when one is
 * not on screen.
 */
export function documentInkFlightStrokes(
  view: EditorView,
  positions: readonly number[],
): { points: DocumentInkClientPoint[]; color: string; width: number }[] | null {
  const strokes: { points: DocumentInkClientPoint[]; color: string; width: number }[] = [];
  for (const pos of positions) {
    const node = view.state.doc.nodeAt(pos);
    const path = node && node.type.name === SHAPE_NODE_NAME && isDocumentInkShapeAttrs(node.attrs)
      ? documentInkPathAt(view, pos, node)
      : null;
    if (!path || !node || path.points.length === 0) return null;
    const style = documentInkStrokeStyle(node.attrs);
    strokes.push({
      points: path.points.map((point) => ({ x: point.x, y: point.y })),
      color: style?.color ?? "#000000",
      width: path.width ?? 2,
    });
  }
  return strokes;
}

/** Where a reading went in the document once the ink left: a node or a run of text. */
export interface DocumentInkReadingPlacement {
  readonly from: number;
  readonly to: number;
  /** An equation node (its own element) rather than typed text. */
  readonly node: boolean;
  /** That equation node as inserted (found again by identity when more writing extends it). */
  readonly equation?: ProseMirrorNode;
}

/** What Ink to Math / Ink to Text read from a piece of writing. */
export type DocumentInkReading =
  | {
      readonly kind: "math";
      readonly latex: string;
      /** The size (CSS px, the equation's `fontSize`) it was written at (`documentInkWrittenEquationSize`). */
      readonly fontSize?: string;
    }
  | {
      readonly kind: "text";
      readonly text: string;
      /**
       * The size (points) each line of `text` is set at: the size it was
       * written at, snapped to Word's list (`documentInkWrittenSizes`).
       * Without it the text takes the size of where it goes.
       */
      readonly sizesPt?: readonly (number | undefined)[];
    };

/** A new equation's attributes: its LaTeX, at the size it was written at when known. */
function inkEquationAttrs(reading: DocumentInkReading, latex: string): Record<string, unknown> {
  return reading.kind === "math" && reading.fontSize ? { latex, fontSize: reading.fontSize } : { latex };
}

/** The `fontSize` mark's value for `points` (the editor's px, as the ribbon writes it), or null out of its range. */
function inkFontSizeValue(points: number | undefined): string | null {
  if (points === undefined || !Number.isFinite(points)) return null;
  // A handwriting's size stays within the ribbon's list (4.5 to 72pt).
  return points >= 4.5 && points <= 72 ? documentFontSizePx(points) : null;
}

/** The marks typed text takes at `$at`, set at `points` when given (the size it was written at). */
function inkTextMarks(
  schema: Schema,
  $at: ResolvedPos | null,
  points: number | undefined,
): readonly ProseMirrorMark[] {
  const base = $at ? $at.marks() : [];
  const sizeType = schema.marks.fontSize;
  const size = inkFontSizeValue(points);
  if (!sizeType || !size) return base;
  return sizeType.create({ size }).addToSet(base.filter((mark) => mark.type !== sizeType));
}

/**
 * The size (Word's list, points) each line of `text` was written at, from
 * the strokes as they stand on the page: client pixels over the page's
 * zoom are the document's own (lib/office-ink-conversion). Null when the
 * strokes are not laid out.
 */
export function documentInkWrittenSizes(
  view: EditorView,
  strokes: readonly ProseMirrorNode[],
  text: string,
): number[] | null {
  try {
    const positions = documentInkPositionsOf(view.state.doc, strokes);
    if (!positions) return null;
    const client = documentInkClientStrokes(view, positions);
    if (!client) return null;
    const first = view.nodeDOM(positions[0]!);
    const sheet =
      (first instanceof Element ? first.closest<HTMLElement>(PAGE_SHEET_SELECTOR) : null) ?? view.dom;
    const { scaleX, scaleY } = documentViewScale(sheet);
    const sx = scaleX || 1;
    const sy = scaleY || 1;
    const own = client.map((stroke) => stroke.map((point) => ({ x: point.x / sx, y: point.y / sy })));
    return officeInkWrittenTextSizes(own, text, OFFICE_FONT_SIZE_PRESETS.word);
  } catch {
    return null;
  }
}

/**
 * The size an equation read from `strokes` is set at: the one on Word's list
 * at which it stands as tall as its writing (lib/office-ink-conversion), as
 * a `fontSize` value. Null when the strokes or the equation are not laid out.
 */
export function documentInkWrittenEquationSize(
  view: EditorView,
  strokes: readonly ProseMirrorNode[],
  latex: string,
): string | null {
  try {
    const positions = documentInkPositionsOf(view.state.doc, strokes);
    if (!positions) return null;
    const client = documentInkClientStrokes(view, positions);
    if (!client) return null;
    const first = view.nodeDOM(positions[0]!);
    const sheet =
      (first instanceof Element ? first.closest<HTMLElement>(PAGE_SHEET_SELECTOR) : null) ?? view.dom;
    const { scaleX, scaleY } = documentViewScale(sheet);
    const points = client.flat();
    if (points.length === 0) return null;
    const xs = points.map((point) => point.x / (scaleX || 1));
    const ys = points.map((point) => point.y / (scaleY || 1));
    const written = { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    const markup = renderValidatedKatexMarkup(latex, true);
    if (markup === null) return null;
    const ownerDocument = view.dom.ownerDocument;
    const measure = (fontSizePx: number) => {
      const probe = ownerDocument.createElement("span");
      probe.setAttribute("aria-hidden", "true");
      Object.assign(probe.style, {
        position: "absolute",
        left: "-10000px",
        top: "0px",
        display: "inline-flex",
        visibility: "hidden",
        whiteSpace: "nowrap",
        fontSize: `${fontSizePx}px`,
        lineHeight: "normal",
      });
      probe.innerHTML = markup;
      ownerDocument.body.appendChild(probe);
      try {
        const width = probe.offsetWidth;
        const height = probe.offsetHeight;
        return width > 0 && height > 0 ? { width, height } : null;
      } finally {
        probe.remove();
      }
    };
    const writtenPt = officeInkEquationFontSizePt(written, measure, OFFICE_FONT_SIZE_PRESETS.word);
    return inkFontSizeValue(writtenPt ?? undefined);
  } catch {
    return null;
  }
}

interface InkReadingTarget {
  /** The paragraph the writing sits over: its position (before it). */
  readonly blockPos: number;
  readonly block: ProseMirrorNode;
  /** A text position in it under the pen's start, when it is under the writing. */
  readonly inlinePos: number | null;
}

/** The paragraph a stroke run is anchored to: the first textblock after the strokes. */
function anchorTextblockAfter(doc: ProseMirrorNode, pos: number): InkReadingTarget | null {
  let found: InkReadingTarget | null = null;
  doc.nodesBetween(pos, doc.content.size, (node, nodePos) => {
    if (found) return false;
    if (node.isTextblock) {
      found = { blockPos: nodePos, block: node, inlinePos: null };
      return false;
    }
    return true;
  });
  return found;
}

/** The caret as the reading's target: the textblock the next typed character would land in. */
function caretReadingTarget(state: EditorState): { blockPos: number; block: ProseMirrorNode; pos: number } | null {
  const { doc, selection } = state;
  const $caret = selection.$to;
  if ($caret.parent.isTextblock && $caret.depth > 0) {
    return { blockPos: $caret.before(), block: $caret.parent, pos: $caret.pos };
  }
  // A selected block (an equation, a shape) or the caret between blocks: the
  // paragraph right after it, when there is one.
  const following = doc.resolve(Math.min(doc.content.size, selection.to)).nodeAfter;
  if (following?.isTextblock) {
    return { blockPos: selection.to, block: following, pos: selection.to + 1 };
  }
  return null;
}

/**
 * Nothing to type into right after the caret (it rests after an equation at
 * the end of the document, or between two blocks): an empty paragraph there,
 * the caret in it, as Word continues after an equation on a new line. Null
 * when no paragraph may stand there.
 */
function paragraphAfterCaret(state: EditorState): Transaction | null {
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) return null;
  const at = Math.min(state.doc.content.size, state.selection.to);
  const $at = state.doc.resolve(at);
  if (!$at.parent.canReplaceWith($at.index(), $at.index(), paragraphType)) return null;
  const transaction = state.tr.insert(at, paragraphType.create());
  return transaction.setSelection(TextSelection.create(transaction.doc, at + 1));
}

/** The caret's older fallbacks, where no paragraph may be added: the nearest text position. */
function nearestReadingTarget(state: EditorState): { blockPos: number; block: ProseMirrorNode; pos: number } | null {
  const { doc, selection } = state;
  const near = Selection.near(doc.resolve(Math.min(doc.content.size, selection.to)), 1);
  const $near = near.$to;
  if ($near.parent.isTextblock && $near.depth > 0) {
    return { blockPos: $near.before(), block: $near.parent, pos: $near.pos };
  }
  const after = anchorTextblockAfter(doc, selection.to);
  return after ? { blockPos: after.blockPos, block: after.block, pos: after.blockPos + 1 } : null;
}

/**
 * A line of the document as the pen sees it on screen (client pixels): a row
 * of a paragraph's text, an empty paragraph, a display equation, or a block
 * object standing in the flow between them (a SmartArt graphic, a picture,
 * a shape, a chart, a table: writing after it belongs after it).
 */
export interface DocumentInkLine {
  /** The textblock (display equation, object) the line belongs to: its position. */
  readonly blockPos: number;
  readonly kind: "text" | "empty" | "equation" | "object";
  /**
   * A block holding blocks (a table, a list, a quote): it stands only for
   * writing outside it; writing over it is its own lines'.
   */
  readonly container?: boolean;
  /**
   * The boxes of the containers and parts the line stands in (a table, its
   * cell), outermost first: the line is the writing's only when the writing
   * is inside every one of them.
   */
  readonly within?: readonly DocumentInkBounds[];
  /**
   * Where a line may be added after this one inside what holds it (a cell,
   * a quote, a text box): that holder's position. None at the top of the
   * page or in a list item (a line under a list follows the list).
   */
  readonly holderPos?: number;
  readonly top: number;
  readonly bottom: number;
  /** The line's column on screen (its paragraph's box: a cell, a page column). */
  readonly left: number;
  readonly right: number;
  /** Where text added after this line's own text goes. */
  readonly end: number;
  /** Which page sheet the line is on (-1 outside the pages, as in Web Layout). */
  readonly sheet: number;
  /** The pitch of this block's lines, paragraph spacing included: how far down one more empty paragraph after it sits. */
  readonly step: number;
}

/** Where a piece of writing's reading goes, from where it was written. */
export type DocumentInkReadingTarget =
  /** Its line holds text: after that text (an equation goes inline). */
  | { readonly kind: "append"; readonly blockPos: number; readonly at: number }
  /** Its line is an empty paragraph: the reading becomes that paragraph's content (a display equation). */
  | { readonly kind: "fill"; readonly blockPos: number }
  /** Its line is a display equation: an equation goes on with it; text takes the line below it. */
  | { readonly kind: "equation"; readonly blockPos: number }
  /**
   * No line is there yet: new lines after this block's, down to where it was
   * written -- inside what holds it (`inside`: a cell, a quote), else after
   * the outermost block it stands in.
   */
  | { readonly kind: "below"; readonly blockPos: number; readonly paragraphs: number; readonly inside?: boolean }
  /** Under (or over the lower half of) a block object: new lines right after it, down to where it was written. */
  | { readonly kind: "afterObject"; readonly blockPos: number; readonly paragraphs: number }
  /** Over (or over the upper half of) a block object: a new line right before it. */
  | { readonly kind: "beforeObject"; readonly blockPos: number };

/** Writing whose middle is within this many line heights of a line's bottom is on that line. */
const INK_SAME_LINE_REACH = 0.75;
/** At most this many lines are added to reach writing far below the last line. */
const INK_MAX_NEW_LINES = 40;
/** How far (positions, then pixels) around the writing lines are looked for. */
const INK_LINE_SEARCH_POSITIONS = 6000;
const INK_LINE_REACH_PX = 640;











/**
 * What the reading's own lines make of the space under a line (client px):
 * how far down each new empty paragraph sits, and how tall the reading
 * will stand. Unknown, the anchor's own pitch and row stand for both.
 */
export interface DocumentInkReadingRoom {
  /** The pitch of a new empty paragraph (the blanks made down to the writing), spacing included. */
  readonly blankStep?: number;
  /** The reading's height as set (its lines at their sizes). */
  readonly readingHeight?: number;
}

export function documentInkReadingTargetFor(
  lines: readonly DocumentInkLine[],
  writing: DocumentInkBounds,
  room: DocumentInkReadingRoom = {},
): DocumentInkReadingTarget | null {
  const middle = (writing.top + writing.bottom) / 2;
  const center = (writing.left + writing.right) / 2;
  const holds = (box: DocumentInkBounds) =>
    center >= box.left && center <= box.right && middle >= box.top && middle <= box.bottom;
  // The writing's lines: those in no container the writing is outside (the
  // cells of a table written beside or under are not), and no container the
  // writing is inside that has lines of its own (they take it; an empty
  // one stands as an object).
  const same = (a: DocumentInkBounds, b: DocumentInkBounds) =>
    a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;
  const hasOwnLines = (container: DocumentInkLine) =>
    lines.some((line) => line !== container && (line.within ?? []).some((box) => same(box, container)));
  const candidates = (pool: readonly DocumentInkLine[]) =>
    pool.filter((line) => !(line.kind === "object" && line.container && holds(line) && hasOwnLines(line)));
  let pool = candidates(lines.filter((line) => (line.within ?? []).every(holds)));
  if (pool.length === 0) pool = candidates(lines);
  let nearest: DocumentInkLine | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const line of pool) {
    // How far up or down, and how far beside its column (the next cell of a
    // table row, the other column of a page, is not this line). Beside an
    // object on its row (a picture narrower than the column) no text
    // stands: the room beside it counts a quarter.
    const across = center < line.left ? line.left - center : center > line.right ? center - line.right : 0;
    const up = middle < line.top ? line.top - middle : middle > line.bottom ? middle - line.bottom : 0;
    const onObjectRow = up === 0 && ((line.kind === "object" && !line.container) || line.kind === "equation");
    const distance = up + (onObjectRow ? across / 4 : across);
    // A line of text the writing is on wins a tie with an object.
    if (distance < best || (distance === best && nearest?.kind === "object" && line.kind !== "object")) {
      best = distance;
      nearest = line;
    }
  }
  if (!nearest) return null;
  const anchor = nearest;
  const height = Math.max(1, anchor.bottom - anchor.top);
  /** A line under `anchor` on its page, in its column (in the same holder when it has one). */
  const lineBelow = () =>
    pool.some(
      (line) =>
        line !== anchor &&
        line.sheet === anchor.sheet &&
        line.top >= anchor.bottom - 1 &&
        line.right > anchor.left &&
        line.left < anchor.right,
    );
  const steps = pool.filter((line) => line.kind === "text" || line.kind === "empty").map((line) => line.step).sort((a, b) => a - b);
  const pitch = Math.max(1, steps[Math.floor(steps.length / 2)] ?? writing.bottom - writing.top);
  // The blanks made down to the writing are new empty paragraphs: their own
  // pitch, measured, else an empty line's here, not the anchor's (a line of
  // 28 pt text took the blanks for 28 pt lines, too few, and the reading
  
  // 「为什么转换成了……偏上的文本」).
  const empties = pool.filter((line) => line.kind === "empty").map((line) => line.step).sort((a, b) => a - b);
  const measuredBlank = room.blankStep !== undefined && room.blankStep > 0 ? room.blankStep : null;
  const emptyBlank = empties.length ? Math.max(1, empties[Math.floor(empties.length / 2)]!) : null;
  /**
   * Paragraphs from the line whose next one starts at `firstTop` down to
   * the writing, at least one (the reading's own): the blanks that put the
   * reading's middle nearest the writing's.
   */
  const paragraphsDownTo = (firstTop: number, blank: number, reading: number) =>
    Math.max(1, Math.min(INK_MAX_NEW_LINES, Math.round((middle - firstTop - reading / 2) / blank) + 1));
  /** Lines from `bottom` down to the writing, at least one; one where a line stands below. */
  const linesDownTo = (bottom: number, step: number) => {
    if (!(middle > bottom) || lineBelow()) return 1;
    if (room.readingHeight === undefined && measuredBlank === null) {
      return Math.max(1, Math.min(INK_MAX_NEW_LINES, Math.round((middle - bottom + step / 2) / step)));
    }
    return paragraphsDownTo(anchor.top + anchor.step, measuredBlank ?? emptyBlank ?? step, room.readingHeight ?? step);
  };
  if (anchor.kind === "object" || (anchor.kind === "equation" && middle < anchor.top)) {
    // A block object takes no text: writing over its upper half, or above
    // it, goes in before it; over its lower half, or under it, after it
    
    // where the nearest line of TEXT was), with the lines made down to where
    // it was written when nothing stands below it on the page.
    if (middle < (anchor.top + anchor.bottom) / 2) return { kind: "beforeObject", blockPos: anchor.blockPos };
    return { kind: "afterObject", blockPos: anchor.blockPos, paragraphs: linesDownTo(anchor.bottom, pitch) };
  }
  if (middle - anchor.bottom > height * INK_SAME_LINE_REACH && !lineBelow()) {
    // Below that line with no line under it on the page: where it was
    // written there is no line yet (Word's Click and Type makes the lines).
    const step = Math.max(height, anchor.step);
    return {
      kind: "below",
      blockPos: anchor.blockPos,
      // The next paragraph starts one of the anchor's own steps below its
      // top; from there the blanks go at a blank's pitch, and the reading's
      // middle meets the writing's.
      paragraphs: paragraphsDownTo(anchor.top + step, measuredBlank ?? emptyBlank ?? step, room.readingHeight ?? height),
      ...(anchor.holderPos !== undefined ? { inside: true } : {}),
    };
  }
  if (anchor.kind === "equation") return { kind: "equation", blockPos: anchor.blockPos };
  if (anchor.kind === "empty") return { kind: "fill", blockPos: anchor.blockPos };
  return { kind: "append", blockPos: anchor.blockPos, at: anchor.end };
}

/** A paragraph with no text in it (spaces at most, no picture or field). */
function inkEmptyLine(node: ProseMirrorNode): boolean {
  if (node.content.size === 0) return true;
  let empty = true;
  node.forEach((child) => {
    if (!child.isText || (child.text ?? "").trim() !== "") empty = false;
  });
  return empty;
}

/** A block's text rows on screen from its fragments' rects: boxes taller than a row (marks around lines) are not rows. */
function inkTextRows(rects: readonly DOMRect[]): { top: number; bottom: number }[] {
  const usable = rects.filter((rect) => rect.width > 0 && rect.height > 0);
  if (usable.length === 0) return [];
  const heights = usable.map((rect) => rect.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)]!;
  const rows: { top: number; bottom: number }[] = [];
  for (const rect of usable.filter((r) => r.height <= median * 1.6 + 2).sort((a, b) => a.top - b.top)) {
    const row = rows[rows.length - 1];
    if (row && rect.top < row.top + Math.max(4, median * 0.6)) {
      row.top = Math.min(row.top, rect.top);
      row.bottom = Math.max(row.bottom, rect.bottom);
    } else {
      rows.push({ top: rect.top, bottom: rect.bottom });
    }
  }
  return rows;
}

/**
 * The space between this block and its neighbour on screen, however the
 * page makes it (margins, a gap, the page's own spacing): measured from the
 * previous block in the flow, else the next.
 */
function inkBlockSpacing(dom: HTMLElement, rect: DOMRect): number {
  const view = dom.ownerDocument.defaultView;
  // The nearest sibling that takes up room in the flow (a stroke's or a
  // floating object's box does not).
  const inFlow = (backward: boolean): DOMRect | null => {
    for (
      let sibling = backward ? dom.previousElementSibling : dom.nextElementSibling;
      sibling;
      sibling = backward ? sibling.previousElementSibling : sibling.nextElementSibling
    ) {
      if (!(sibling instanceof HTMLElement)) continue;
      const style = view?.getComputedStyle(sibling);
      const box = sibling.getBoundingClientRect();
      if (box.height > 0 && style?.position !== "absolute" && style?.position !== "fixed" && style?.float === "none") {
        return box;
      }
    }
    return null;
  };
  const previous = inFlow(true);
  if (previous && previous.bottom <= rect.top + 1) return Math.max(0, rect.top - previous.bottom);
  const next = inFlow(false);
  if (next && next.top >= rect.bottom - 1) return Math.max(0, next.top - rect.bottom);
  const style = view?.getComputedStyle(dom);
  const scaleY = documentViewScale(dom).scaleY || 1;
  return (
    Math.max(Number.parseFloat(style?.marginTop ?? "") || 0, Number.parseFloat(style?.marginBottom ?? "") || 0) * scaleY
  );
}





















export type DocumentInkBlockRole = "text" | "equation" | "object" | "container" | "part" | "skip";

export function documentInkBlockRole(node: ProseMirrorNode): DocumentInkBlockRole {
  if (!node.isBlock) return "skip";
  if (isDocumentInkShapeAttrs(node.attrs)) return "skip";
  if (node.type.name === EQUATION_NODE_BY_PLACEMENT.display) return "equation";
  if (node.isTextblock) return node.type.spec.code ? "object" : "text";
  if (node.isAtom || node.isLeaf) return "object";
  return (node.type.spec.group ?? "").split(/\s+/).includes("block") ? "container" : "part";
}

/** A block's box on screen as the line search measures it. */
export interface DocumentInkBlockBox extends DocumentInkBounds {
  /** Which page sheet it is on (-1 outside the pages). */
  readonly sheet: number;
  /** Its pitch, spacing included: how far down one more line after it sits. */
  readonly step: number;
}

/** How the document stands on screen, for {@link documentInkLinesIn}. */
export interface DocumentInkLayout {
  /**
   * The block's box when it takes room in the flow and is within reach of
   * the writing; null when it floats over the text, is hidden, or is not
   * laid out (its own blocks may still be).
   */
  block(node: ProseMirrorNode, pos: number): DocumentInkBlockBox | null;
  /**
   * A textblock's rows, top to bottom, each with the position its text ends
   * at (an empty block: its caret's row). Empty: the block's box is one row.
   */
  rows(node: ProseMirrorNode, pos: number, box: DocumentInkBlockBox): readonly { top: number; bottom: number; end: number }[];
}

/**
 * The document's lines between `from` and `to` as `layout` lays them out:
 * rows of text, empty lines, display equations, objects and containers
 * ({@link documentInkBlockRole}), each with the containers it stands in.
 */
export function documentInkLinesIn(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  layout: DocumentInkLayout,
): DocumentInkLine[] {
  const lines: DocumentInkLine[] = [];
  const boxes = new Map<number, DocumentInkBlockBox | null>();
  const boxAt = (node: ProseMirrorNode, pos: number) => {
    if (!boxes.has(pos)) boxes.set(pos, layout.block(node, pos));
    return boxes.get(pos) ?? null;
  };
  /**
   * The containers and parts a block at `pos` stands in (a page excepted),
   * outermost first; and where a line may be added beside it inside them
   * (a cell, a quote, a text box -- not a list item: a line under a list
   * is a paragraph after the list).
   */
  const surroundings = (pos: number) => {
    const $pos = doc.resolve(pos);
    const within: DocumentInkBounds[] = [];
    for (let depth = 2; depth <= $pos.depth; depth += 1) {
      const box = boxAt($pos.node(depth), $pos.before(depth));
      if (box) within.push(box);
    }
    const parentIsListItem =
      $pos.depth >= 3 && ($pos.node($pos.depth - 1).type.spec.group ?? "").split(/\s+/).includes("list");
    const holderPos = $pos.depth >= 2 && !parentIsListItem ? $pos.before($pos.depth) : undefined;
    return { within, holderPos };
  };
  doc.nodesBetween(from, to, (node, pos) => {
    const role = documentInkBlockRole(node);
    if (role === "skip") return false;
    if (role === "part") return true;
    const box = boxAt(node, pos);
    if (role === "container") {
      if (box) {
        const { within } = surroundings(pos);
        lines.push({ blockPos: pos, kind: "object", container: true, ...box, end: pos + node.nodeSize, ...(within.length ? { within } : {}) });
      }
      return true;
    }
    if (!box) return false;
    const { within, holderPos } = surroundings(pos);
    const place = { ...(within.length ? { within } : {}), ...(holderPos !== undefined ? { holderPos } : {}) };
    if (role === "object" || role === "equation") {
      lines.push({ blockPos: pos, kind: role, ...box, end: pos + node.nodeSize, ...place });
      return false;
    }
    const rows = layout.rows(node, pos, box);
    const contentEnd = pos + 1 + node.content.size;
    const empty = inkEmptyLine(node);
    const used = rows.length ? rows : [{ top: box.top, bottom: box.bottom, end: contentEnd }];
    // A row's text box is shorter than its line: the pitch is the block's own.
    const pitch = empty ? box.step : (box.bottom - box.top) / used.length + (box.step - (box.bottom - box.top));
    for (const row of used) {
      lines.push({
        blockPos: pos,
        kind: empty ? "empty" : "text",
        top: row.top,
        bottom: row.bottom,
        left: box.left,
        right: box.right,
        end: empty ? contentEnd : row.end,
        sheet: box.sheet,
        step: pitch,
        ...place,
      });
    }
    return false;
  });
  return lines;
}

/**
 * The document's lines around `writing` (within `reach` px of it), on
 * screen. Empty where nothing is laid out. `writingSheet`, the page the
 * writing is on, is sheet 0.
 */
export function documentInkLinesNear(
  view: EditorView,
  writing: DocumentInkBounds,
  reach: number = INK_LINE_REACH_PX,
  writingSheet: Element | null = null,
): DocumentInkLine[] {
  const { doc } = view.state;
  const ownerDocument = view.dom.ownerDocument;
  const range = ownerDocument.createRange();
  if (typeof range.getClientRects !== "function") return [];
  const middle = (writing.top + writing.bottom) / 2;
  const area = view.dom.getBoundingClientRect();
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));
  const hit = view.posAtCoords({
    left: clamp((writing.left + writing.right) / 2, area.left + 1, area.right - 1),
    top: clamp(middle, area.top + 1, area.bottom - 1),
  });
  const center = hit ? hit.pos : 0;
  const sheets: Element[] = writingSheet ? [writingSheet] : [];
  const sheetOf = (element: Element) => {
    const sheet = element.closest(PAGE_SHEET_SELECTOR);
    if (!sheet) return -1;
    const known = sheets.indexOf(sheet);
    if (known >= 0) return known;
    sheets.push(sheet);
    return sheets.length - 1;
  };
  const elements = new Map<number, HTMLElement>();
  const layout: DocumentInkLayout = {
    block(_node, pos) {
      const dom = view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) return null;
      const style = ownerDocument.defaultView?.getComputedStyle(dom);
      if (style && (style.position === "absolute" || style.position === "fixed" || style.float !== "none" || style.display === "none")) {
        return null;
      }
      const rect = dom.getBoundingClientRect();
      if (!(rect.height > 0) || rect.bottom < middle - reach || rect.top > middle + reach) return null;
      elements.set(pos, dom);
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        sheet: sheetOf(dom),
        step: rect.height + inkBlockSpacing(dom, rect),
      };
    },
    rows(node, pos, box) {
      const dom = elements.get(pos);
      if (!dom) return [];
      const contentEnd = pos + 1 + node.content.size;
      if (inkEmptyLine(node)) {
        try {
          const caret = view.coordsAtPos(pos + 1);
          return [{ top: caret.top, bottom: caret.bottom, end: contentEnd }];
        } catch {
          return [];
        }
      }
      range.selectNodeContents(dom);
      const rows = inkTextRows(Array.from(range.getClientRects()));
      return rows.map((row, index) => {
        let end = contentEnd;
        if (index < rows.length - 1) {
          // A row inside the paragraph ends where the next begins: the
          // position at its right end.
          const found = view.posAtCoords({ left: box.right - 1, top: (row.top + row.bottom) / 2 });
          if (found && found.pos > pos && found.pos <= contentEnd) end = found.pos;
        }
        return { ...row, end };
      });
    },
  };
  return documentInkLinesIn(
    doc,
    Math.max(0, center - INK_LINE_SEARCH_POSITIONS),
    Math.min(doc.content.size, center + INK_LINE_SEARCH_POSITIONS),
    layout,
  );
}

function inkWritingBox(strokes: readonly (readonly DocumentInkClientPoint[])[] | null): DocumentInkBounds | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const stroke of strokes ?? []) {
    for (const point of stroke) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
  }
  return Number.isFinite(left) ? { left, top, right, bottom } : null;
}

/**
 * A new empty paragraph as the page draws it (client px, at its zoom): its
 * pitch, spacing included, its line box, and that line box over its font
 * size (a typed line's box at another size). Measured from two of them
 * rendered beside the editor (never inside it: its observer would read them
 * as typing), in the editor's own classes and style. Null where nothing is
 * laid out.
 */
export function documentInkBlankLine(view: EditorView): { pitch: number; lineBox: number; factor: number } | null {
  const paragraph = view.state.schema.nodes.paragraph;
  const host = view.dom.parentElement;
  if (!paragraph || !host) return null;
  const ownerDocument = view.dom.ownerDocument;
  const serializer = DOMSerializer.fromSchema(view.state.schema);
  const probe = ownerDocument.createElement("div");
  probe.className = view.dom.className;
  const inline = view.dom.getAttribute("style");
  if (inline) probe.setAttribute("style", inline);
  probe.setAttribute("aria-hidden", "true");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.left = "0";
  probe.style.top = "0";
  probe.style.width = `${view.dom.offsetWidth}px`;
  probe.style.height = "auto";
  const blank = () => {
    const node = serializer.serializeNode(paragraph.create());
    // An empty textblock holds a break, as the editor draws one.
    if (node instanceof HTMLElement) node.appendChild(ownerDocument.createElement("br"));
    return node;
  };
  const first = blank();
  const second = blank();
  probe.append(first, second);
  host.appendChild(probe);
  try {
    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) return null;
    const a = first.getBoundingClientRect();
    const b = second.getBoundingClientRect();
    const pitch = b.top - a.top;
    const lineBox = a.height;
    if (!(pitch > 0) || !(lineBox > 0)) return null;
    const fontPx = Number.parseFloat(ownerDocument.defaultView?.getComputedStyle(first).fontSize ?? "");
    const scaleY = documentViewScale(view.dom).scaleY || 1;
    const factor = fontPx > 0 ? lineBox / (fontPx * scaleY) : 1.2;
    return { pitch, lineBox, factor: Number.isFinite(factor) && factor > 0.8 && factor < 3 ? factor : 1.2 };
  } finally {
    probe.remove();
  }
}

/**
 * How tall a reading stands once set (client px): a text reading's lines at
 * their sizes in the page's line box (a line never shorter than an empty
 * one), the paragraph spacing between them; an equation, as tall as it was
 * written.
 */
function documentInkReadingHeight(
  view: EditorView,
  reading: DocumentInkReading,
  writing: DocumentInkBounds,
  blank: { pitch: number; lineBox: number; factor: number },
): number {
  if (reading.kind === "math") return Math.max(blank.lineBox, writing.bottom - writing.top);
  const scaleY = documentViewScale(view.dom).scaleY || 1;
  const lines = reading.text.split("\n");
  const boxes = lines.map((_, index) => {
    const points = reading.sizesPt?.[index];
    const box = points !== undefined && points > 0 ? (ptToPx(points)) * scaleY * blank.factor : blank.lineBox;
    return Math.max(blank.lineBox, box);
  });
  return boxes.reduce((sum, box) => sum + box, 0) + (lines.length - 1) * Math.max(0, blank.pitch - blank.lineBox);
}

/**
 * Where the writing of `strokes` puts its reading; null where nothing can be
 * measured. A reading of several lines (ink lassoed over a few lines, then
 * Ink to Text) begins where its first line was written: measured by the
 * whole writing, its first line went to the line in the middle of it.
 */
function documentInkWritingTarget(
  view: EditorView,
  strokes: readonly ProseMirrorNode[],
  reading?: DocumentInkReading,
): DocumentInkReadingTarget | null {
  try {
    const positions = documentInkPositionsOf(view.state.doc, strokes);
    if (!positions) return null;
    const client = documentInkClientStrokes(view, positions);
    // Several lines read: the first written line is where the reading's
    // first line goes, and it is that line that is measured against it.
    const textLines = reading?.kind === "text" ? reading.text.split("\n") : [];
    const said = textLines.filter((line) => line.trim() !== "").length;
    const box =
      said > 1 && client ? (officeInkWritingLinesOf(client, said)[0] ?? inkWritingBox(client)) : inkWritingBox(client);
    if (!box) return null;
    const first = textLines.findIndex((line) => line.trim() !== "");
    const placed: DocumentInkReading | undefined =
      reading?.kind === "text" && said > 1
        ? {
            ...reading,
            text: textLines[first] ?? "",
            sizesPt: reading.sizesPt?.[first] !== undefined ? [reading.sizesPt[first]!] : undefined,
          }
        : reading;
    // The page the writing is on: its own lines first (the first line of
    // the next page is not under writing at the foot of this one).
    const canvas = documentInkCanvas(view, positions[0]!);
    const sheet = canvas?.closest(PAGE_SHEET_SELECTOR) ?? null;
    const onSheet = (lines: DocumentInkLine[]) => {
      const own = sheet ? lines.filter((line) => line.sheet === 0) : [];
      return own.length > 0 ? own : lines;
    };
    // No line near the writing (far under the last one, a zoomed page): the
    
    
    const near = onSheet(documentInkLinesNear(view, box, INK_LINE_REACH_PX, sheet));
    const lines = near.length > 0 ? near : onSheet(documentInkLinesNear(view, box, Number.POSITIVE_INFINITY, sheet));
    // The blanks made down to the writing at their own pitch, and the
    // reading's middle, not its top, where the writing's was.
    const blank = placed ? documentInkBlankLine(view) : null;
    return documentInkReadingTargetFor(
      lines,
      box,
      blank && placed ? { blankStep: blank.pitch, readingHeight: documentInkReadingHeight(view, placed, box, blank) } : {},
    );
  } catch {
    // A view with no layout (a test, a view torn down meanwhile).
    return null;
  }
}

/** A caret in text at or after `pos` (else before it): never a selected node, which would leave the Draw tab. */
function inkCaretNear(doc: ProseMirrorNode, pos: number): Selection | null {
  const $pos = doc.resolve(Math.max(0, Math.min(doc.content.size, pos)));
  return TextSelection.findFrom($pos, 1, true) ?? TextSelection.findFrom($pos, -1, true);
}

/**
 * Writing still waiting to be read while a reading goes in (Ink to Text reads
 * a finished line while the pen writes the next): it stays where it is on
 * screen. `replaced` hears of each stroke rewritten to stay.
 */
export interface DocumentInkHold {
  readonly keep: readonly ProseMirrorNode[];
  readonly replaced: (from: ProseMirrorNode, to: ProseMirrorNode) => void;
}

interface HeldInk {
  readonly node: ProseMirrorNode;
  readonly left: number;
  readonly top: number;
  readonly sheet: Element | null;
}

/** Where each stroke to hold stands on screen now (its box), by identity. */
function inkPlacesOnScreen(view: EditorView, keep: readonly ProseMirrorNode[]): HeldInk[] {
  if (keep.length === 0) return [];
  const present = documentInkStrokes(view.state.doc);
  const used = new Set<number>();
  const held: HeldInk[] = [];
  for (const node of keep) {
    const hit = present.find((entry) => !used.has(entry.pos) && (entry.node === node || entry.node.eq(node)));
    if (!hit) continue;
    used.add(hit.pos);
    // The painted stroke (its node is an empty box in the flow).
    const dom = documentInkCanvas(view, hit.pos);
    if (!dom) continue;
    const rect = dom.getBoundingClientRect();
    // `node` as the caller holds it: that is the stroke `replaced` names.
    held.push({ node, left: rect.left, top: rect.top, sheet: dom.closest(PAGE_SHEET_SELECTOR) });
  }
  return held;
}

/**
 * The reading just went in (`reading`, dispatched): every held stroke the
 * page moved (the new text reflowed the paragraphs it is anchored to) is
 * moved back by as much, so the line being written does not slide under the
 * pen. In the reading's Undo step (an appended transaction), so Undo puts
 * both back together. A stroke whose paragraph went to another page went
 * with it, as anchored ink does.
 */
function holdInkStill(view: EditorView, held: readonly HeldInk[], reading: Transaction, hold: DocumentInkHold): void {
  if (held.length === 0) return;
  const present = documentInkStrokes(view.state.doc);
  const used = new Set<number>();
  let transaction = view.state.tr;
  const moved: { from: ProseMirrorNode; pos: number }[] = [];
  for (const before of held) {
    const hit = present.find((entry) => !used.has(entry.pos) && (entry.node === before.node || entry.node.eq(before.node)));
    if (!hit) continue;
    used.add(hit.pos);
    const dom = documentInkCanvas(view, hit.pos);
    if (!dom || dom.closest(PAGE_SHEET_SELECTOR) !== before.sheet) continue;
    const rect = dom.getBoundingClientRect();
    const dxClient = before.left - rect.left;
    const dyClient = before.top - rect.top;
    if (Math.abs(dxClient) < 0.5 && Math.abs(dyClient) < 0.5) continue;
    const { scaleX, scaleY } = documentViewScale(before.sheet instanceof HTMLElement ? before.sheet : view.dom);
    const patch = documentShapeKeyPatch(hit.node.attrs, {
      kind: "move",
      dx: dxClient / (scaleX || 1),
      dy: dyClient / (scaleY || 1),
    });
    if (!patch) continue;
    transaction = transaction.setNodeMarkup(hit.pos, undefined, { ...hit.node.attrs, ...patch }, hit.node.marks);
    moved.push({ from: before.node, pos: hit.pos });
  }
  if (!transaction.docChanged) return;
  view.dispatch(transaction.setMeta("appendedTransaction", reading));
  for (const { from, pos } of moved) {
    const now = view.state.doc.nodeAt(pos);
    if (now && now.type.name === SHAPE_NODE_NAME && isDocumentInkShapeAttrs(now.attrs)) hold.replaced(from, now);
  }
}

/** Marks a step that takes strokes out because the reader asked (a delete, the
 * eraser, a conversion): not one the ink-loss recorder is looking for. */
export const DOCUMENT_INK_TAKEN_OUT_BY_READER_META = "documentInkTakenOutByReader";

/** Marks the transaction a reading lands with (more writing read beside converted text is not typing into it). */
export const DOCUMENT_INK_READING_META = "documentInkReading";

/**
 * Draw ▸ Ink to Math / Ink to Text: the strokes of one piece of writing are
 * replaced by what they say, in ONE Undo step, where they were written
 * ({@link documentInkReadingTargetFor}). Where nothing can be measured (no
 * layout), at the caret as before. The caret ends after the reading.
 * False, with nothing changed, when a stroke changed meanwhile or the
 * reading has nowhere to go. Text is set at the size it was written at
 * (`documentInkWrittenSizes`) unless the reading names its sizes; `hold`
 * keeps writing still waiting to be read where it is on screen.
 */
export function replaceDocumentInkWithReading(
  view: EditorView,
  strokes: readonly ProseMirrorNode[],
  reading: DocumentInkReading,
  placed?: (placement: DocumentInkReadingPlacement) => void,
  hold?: DocumentInkHold,
): boolean {
  if (!view.editable) return false;
  const sized: DocumentInkReading =
    reading.kind === "text" && !reading.sizesPt
      ? { ...reading, sizesPt: documentInkWrittenSizes(view, strokes, reading.text) ?? undefined }
      : reading.kind === "math" && !reading.fontSize
        ? { ...reading, fontSize: documentInkWrittenEquationSize(view, strokes, reading.latex) ?? undefined }
        : reading;
  const held = hold ? inkPlacesOnScreen(view, hold.keep.filter((node) => !strokes.includes(node))) : [];
  const written = documentInkWritingTarget(view, strokes, sized);
  const atWriting = written ? planDocumentInkReadingAt(view.state, strokes, sized, written) : null;
  if (atWriting) {
    const transaction = closeHistory(atWriting.transaction).setMeta(DOCUMENT_INK_READING_META, true);
    view.dispatch(transaction);
    placed?.(atWriting.placement);
    if (hold) holdInkStill(view, held, transaction, hold);
    return true;
  }
  const dispatched: Transaction[] = [];
  const done = replaceDocumentInkReadingAtCaret(view, strokes, sized, placed, dispatched);
  if (done && hold && dispatched[0]) holdInkStill(view, held, dispatched[0], hold);
  return done;
}

 
function replaceDocumentInkReadingAtCaret(
  view: EditorView,
  strokes: readonly ProseMirrorNode[],
  reading: DocumentInkReading,
  placed?: (placement: DocumentInkReadingPlacement) => void,
  dispatched?: Transaction[],
): boolean {
  let state = view.state;
  let target = caretReadingTarget(state);
  let prepared: Transaction | null = null;
  if (!target) {
    // The caret has nothing to type into after it: a new paragraph there
    // (the same Undo step), or else the nearest text position.
    prepared = paragraphAfterCaret(state);
    if (prepared) {
      state = state.apply(prepared);
      target = caretReadingTarget(state);
    } else {
      target = nearestReadingTarget(state);
    }
  }
  if (!target) return false;
  const planned = planDocumentInkReading(state, strokes, reading, target);
  if (!planned) return false;
  let transaction = view.state.tr;
  for (const step of prepared?.steps ?? []) transaction.step(step);
  for (const step of planned.transaction.steps) transaction.step(step);
  transaction = transaction.setSelection(Selection.fromJSON(transaction.doc, planned.transaction.selection.toJSON()));
  const closed = closeHistory(transaction).setMeta(DOCUMENT_INK_READING_META, true);
  view.dispatch(closed);
  dispatched?.push(closed);
  placed?.(planned.placement);
  return true;
}

const CJK_CHARACTER = /[\u2e80-\u2fff\u3000-\u303f\u3040-\u30ff\u3100-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;

/** Whether a space goes between `before` and `after` when one is added next to the other (none beside CJK, as typed). */
function inkSpaceBetween(before: string, after: string): boolean {
  return (
    before !== "" &&
    after !== "" &&
    !/\s/.test(before) &&
    !/\s/.test(after) &&
    !CJK_CHARACTER.test(before) &&
    !CJK_CHARACTER.test(after)
  );
}

/**
 * The position just after the outermost block (below the page) holding the
 * block at `blockPos`: a list or a table as a whole; the block itself at the
 * top of the page -- a leaf (a picture, an equation) as well as a paragraph.
 */
function inkAfterTopBlock(doc: ProseMirrorNode, blockPos: number): number {
  const $at = doc.resolve(Math.max(0, Math.min(doc.content.size, blockPos)));
  // A page wraps the blocks when the document's children are parts of it.
  const pageDepth = $at.depth >= 1 && documentInkBlockRole($at.node(1)) === "part" ? 1 : 0;
  if ($at.depth > pageDepth) return $at.after(pageDepth + 1);
  const block = doc.nodeAt(blockPos);
  return blockPos + (block?.nodeSize ?? 0);
}

/**
 * Where a paragraph goes right before or right after the object at
 * `blockPos`: beside it in its own container when a paragraph may stand
 * there, else beside the nearest container that may take one. Null where
 * none may.
 */
function inkBesideObject(
  doc: ProseMirrorNode,
  blockPos: number,
  side: "before" | "after",
  paragraphType: NodeType,
): number | null {
  const node = doc.nodeAt(blockPos);
  if (!node) return null;
  let $at = doc.resolve(side === "after" ? blockPos + node.nodeSize : blockPos);
  for (;;) {
    if ($at.parent.canReplaceWith($at.index(), $at.index(), paragraphType)) return $at.pos;
    if ($at.depth === 0) return null;
    $at = doc.resolve(side === "after" ? $at.after() : $at.before());
  }
}

/**
 * The reading's transaction where its writing was ({@link DocumentInkReadingTarget}),
 * with where it landed; null when it cannot land there.
 */
export function planDocumentInkReadingAt(
  state: EditorState,
  strokes: readonly ProseMirrorNode[],
  reading: DocumentInkReading,
  target: DocumentInkReadingTarget,
): { transaction: Transaction; placement: DocumentInkReadingPlacement } | null {
  const { schema, doc } = state;
  const positions = documentInkPositionsOf(doc, strokes);
  if (!positions) return null;
  const paragraphType = schema.nodes.paragraph;
  const inlineType = schema.nodes[EQUATION_NODE_BY_PLACEMENT.inline];
  const displayType = schema.nodes[EQUATION_NODE_BY_PLACEMENT.display];
  if (!paragraphType) return null;
  const block = doc.nodeAt(target.blockPos);
  if (!block) return null;
  const blockEnd = target.blockPos + block.nodeSize;
  const textLines = reading.kind === "text" ? reading.text.split("\n") : [];
  const lineSize = (index: number) => (reading.kind === "text" ? reading.sizesPt?.[index] : undefined);
  /** Lines of text as paragraphs, the first being line `first` of the reading. */
  const textParagraphs = (lines: readonly string[], first = 0) =>
    lines.map((value, index) =>
      paragraphType.create(null, value ? schema.text(value, inkTextMarks(schema, null, lineSize(first + index))) : null),
    );
  /** Text typed at `at` of the transaction's document, set at line `index`'s size. */
  const typeText = (text: string, at: number, index: number) => {
    if (!text) return;
    transaction = transaction.insert(at, schema.text(text, inkTextMarks(schema, transaction.doc.resolve(at), lineSize(index))));
  };
  let transaction = state.tr;
  // What was inserted and where the caret goes, in this transaction's
  // positions before the strokes' removal.
  let insertedFrom: number;
  let caretAfter: number;
  let insertedNode = false;

  /** A display equation at `at`, a line to go on in after it; false where none may stand. */
  const displayEquationAt = (at: number, latex: string, replaceTo?: number): boolean => {
    if (!displayType) return false;
    const $at = transaction.doc.resolve(at);
    const index = $at.index();
    const endIndex = replaceTo === undefined ? index : $at.parent.childCount > index ? index + 1 : index;
    if (!$at.parent.canReplaceWith(index, endIndex, displayType)) return false;
    const equation = displayType.create(inkEquationAttrs(reading, latex));
    transaction =
      replaceTo === undefined ? transaction.insert(at, equation) : transaction.replaceWith(at, replaceTo, equation);
    insertedFrom = at;
    insertedNode = true;
    caretAfter = at + equation.nodeSize;
    const $after = transaction.doc.resolve(caretAfter);
    if ($after.nodeAfter?.isTextblock) {
      caretAfter += 1;
    } else if ($after.parent.canReplaceWith($after.index(), $after.index(), paragraphType)) {
      transaction = transaction.insert(caretAfter, paragraphType.create());
      caretAfter += 1;
    }
    return true;
  };
  /** Text lines after the first, as paragraphs after the block at `after`. */
  const restOfText = (after: number): void => {
    if (textLines.length < 2) return;
    const $after = transaction.doc.resolve(after);
    let at = after;
    if (!$after.parent.canReplaceWith($after.index(), $after.index(), paragraphType)) {
      at = inkAfterTopBlock(transaction.doc, transaction.mapping.map(target.blockPos));
    }
    const paragraphs = textParagraphs(textLines.slice(1), 1);
    transaction = transaction.insert(at, paragraphs);
    caretAfter = at + paragraphs.reduce((size, node) => size + node.nodeSize, 0) - 1;
  };

  switch (target.kind) {
    case "append": {
      if (!block.isTextblock) return null;
      const contentEnd = target.blockPos + 1 + block.content.size;
      const at = Math.max(target.blockPos + 1, Math.min(contentEnd, target.at));
      const $at = doc.resolve(at);
      const before = $at.parentOffset > 0 ? doc.textBetween(at - 1, at, "\n", "\ufffc") : "";
      const after = at < contentEnd ? doc.textBetween(at, at + 1, "\n", "\ufffc") : "";
      if (reading.kind === "math") {
        if (inlineType && $at.parent.canReplaceWith($at.index(), $at.index(), inlineType)) {
          const lead = inkSpaceBetween(before, "x") ? " " : "";
          const trail = inkSpaceBetween("x", after) ? " " : "";
          const inline = inlineType.create(inkEquationAttrs(reading, reading.latex));
          const nodes = [
            ...(lead ? [schema.text(lead)] : []),
            inline,
            ...(trail ? [schema.text(trail)] : []),
          ];
          transaction = transaction.insert(at, nodes);
          insertedFrom = at + lead.length;
          insertedNode = true;
          caretAfter = insertedFrom + inline.nodeSize;
          break;
        }
        // No inline equation in this block (code): a display one after it.
        if (!displayEquationAt(inkAfterTopBlock(doc, target.blockPos), reading.latex)) return null;
        break;
      }
      const first = textLines[0] ?? "";
      const lead = inkSpaceBetween(before, first.charAt(0)) ? " " : "";
      const trail = inkSpaceBetween(first.charAt(first.length - 1), after) ? " " : "";
      typeText(`${lead}${first}${trail}`, at, 0);
      insertedFrom = at + lead.length;
      caretAfter = insertedFrom + first.length;
      restOfText(transaction.mapping.map(blockEnd));
      break;
    }
    case "fill": {
      if (!block.isTextblock) return null;
      if (reading.kind === "math") {
        if (block.content.size === 0 && displayEquationAt(target.blockPos, reading.latex, blockEnd)) break;
        // Spaces in it, or no display equation may stand here (a list item): inline in it.
        const at = target.blockPos + 1 + block.content.size;
        const $at = doc.resolve(at);
        if (!inlineType || !$at.parent.canReplaceWith($at.index(), $at.index(), inlineType)) return null;
        const inline = inlineType.create(inkEquationAttrs(reading, reading.latex));
        transaction = transaction.insert(at, inline);
        insertedFrom = at;
        insertedNode = true;
        caretAfter = at + inline.nodeSize;
        break;
      }
      const at = target.blockPos + 1 + block.content.size;
      const first = textLines[0] ?? "";
      typeText(first, at, 0);
      insertedFrom = at;
      caretAfter = at + first.length;
      restOfText(transaction.mapping.map(blockEnd));
      break;
    }
    case "equation": {
      if (reading.kind === "math") {
        // Writing on an equation's line goes on with that equation.
        const latex = [String(block.attrs.latex ?? "").trim(), reading.latex.trim()].filter(Boolean).join(" ");
        transaction = transaction.setNodeMarkup(target.blockPos, undefined, { ...block.attrs, latex });
        insertedFrom = target.blockPos;
        insertedNode = true;
        caretAfter = blockEnd;
        const $after = transaction.doc.resolve(caretAfter);
        if ($after.nodeAfter?.isTextblock) caretAfter += 1;
        break;
      }
      const $after = doc.resolve(blockEnd);
      const at = $after.parent.canReplaceWith($after.index(), $after.index(), paragraphType)
        ? blockEnd
        : inkAfterTopBlock(doc, target.blockPos);
      const paragraphs = textParagraphs(textLines);
      transaction = transaction.insert(at, paragraphs);
      insertedFrom = at + 1;
      caretAfter = at + paragraphs.reduce((size, node) => size + node.nodeSize, 0) - 1;
      break;
    }
    case "afterObject":
    case "beforeObject": {
      // Around a block object: a new line right before it, or right after it
      // (and the lines down to where it was written), the object kept whole.
      const at = inkBesideObject(doc, target.blockPos, target.kind === "afterObject" ? "after" : "before", paragraphType);
      if (at === null) return null;
      const count = target.kind === "afterObject" ? target.paragraphs : 1;
      const blanks = Array.from({ length: Math.max(0, count - 1) }, () => paragraphType.create());
      if (blanks.length) transaction = transaction.insert(at, blanks);
      const lineAt = at + blanks.reduce((size, node) => size + node.nodeSize, 0);
      if (reading.kind === "math") {
        if (!displayEquationAt(lineAt, reading.latex)) return null;
        break;
      }
      const paragraphs = textParagraphs(textLines);
      transaction = transaction.insert(lineAt, paragraphs);
      insertedFrom = lineAt + 1;
      caretAfter = lineAt + paragraphs.reduce((size, node) => size + node.nodeSize, 0) - 1;
      break;
    }
    case "below": {
      // Inside what holds the line (a cell, a quote) when the writing is
      // there; else after the outermost block it stands in.
      let at = inkAfterTopBlock(doc, target.blockPos);
      if (target.inside) {
        const $after = doc.resolve(target.blockPos + block.nodeSize);
        if ($after.parent.canReplaceWith($after.index(), $after.index(), paragraphType)) at = $after.pos;
      }
      const $at = doc.resolve(at);
      if (!$at.parent.canReplaceWith($at.index(), $at.index(), paragraphType)) return null;
      const blanks = Array.from({ length: Math.max(0, target.paragraphs - 1) }, () => paragraphType.create());
      if (blanks.length) transaction = transaction.insert(at, blanks);
      const lineAt = at + blanks.reduce((size, node) => size + node.nodeSize, 0);
      if (reading.kind === "math") {
        if (!displayEquationAt(lineAt, reading.latex)) return null;
        break;
      }
      const paragraphs = textParagraphs(textLines);
      transaction = transaction.insert(lineAt, paragraphs);
      insertedFrom = lineAt + 1;
      caretAfter = lineAt + paragraphs.reduce((size, node) => size + node.nodeSize, 0) - 1;
      break;
    }
  }
  // The strokes go, in the same step.
  const removal = transaction.mapping.maps.length;
  for (const pos of [...positions].sort((a, b) => b - a)) {
    const node = doc.nodeAt(pos);
    if (!node) return null;
    const from = transaction.mapping.map(pos, 1);
    const landed = transaction.doc.nodeAt(from);
    if (!landed || !landed.eq(node)) return null;
    transaction = transaction.delete(from, from + landed.nodeSize);
  }
  const afterRemoval = transaction.mapping.slice(removal);
  const caretPos = afterRemoval.map(caretAfter!, -1);
  const caret = inkCaretNear(transaction.doc, caretPos);
  if (caret) transaction = transaction.setSelection(caret);
  const from = afterRemoval.map(insertedFrom!, 1);
  const equation = insertedNode ? transaction.doc.nodeAt(from) ?? undefined : undefined;
  return { transaction, placement: { from, to: Math.max(from, caretPos), node: insertedNode, equation } };
}

/** The reading's transaction against `state`, with where it landed; null when it cannot land. */
function planDocumentInkReading(
  state: EditorState,
  strokes: readonly ProseMirrorNode[],
  reading: DocumentInkReading,
  target: { blockPos: number; block: ProseMirrorNode; pos: number },
): { transaction: Transaction; placement: DocumentInkReadingPlacement } | null {
  const { schema } = state;
  const positions = documentInkPositionsOf(state.doc, strokes);
  if (!positions) return null;
  const { block, blockPos } = target;

  const paragraphType = schema.nodes.paragraph;
  const lineSize = (index: number) => (reading.kind === "text" ? reading.sizesPt?.[index] : undefined);
  const textParagraphs = (lines: readonly string[], first = 0) =>
    lines.map((value, index) =>
      paragraphType.create(null, value ? schema.text(value, inkTextMarks(schema, null, lineSize(first + index))) : null),
    );

  let transaction = state.tr;
  const blockEnd = blockPos + block.nodeSize;
  // Where the caret rests once the reading is in (mapped through the stroke removal below).
  let caretAfter: number;
  // What was inserted, in this transaction's positions before the removal.
  let insertedFrom: number;
  let insertedNode = false;
  if (reading.kind === "math") {
    const inlineType = schema.nodes[EQUATION_NODE_BY_PLACEMENT.inline];
    const displayType = schema.nodes[EQUATION_NODE_BY_PLACEMENT.display];
    if (!inlineType || !displayType) return null;
    const $block = state.doc.resolve(blockPos);
    const parent = $block.parent;
    const index = $block.index();
    const equation = displayType.create(inkEquationAttrs(reading, reading.latex));
    insertedNode = true;
    if (block.content.size === 0 && parent.canReplaceWith(index, index + 1, displayType)) {
      transaction = transaction.replaceWith(blockPos, blockEnd, equation);
      insertedFrom = blockPos;
      caretAfter = blockPos + equation.nodeSize;
    } else if (parent.canReplaceWith(index + 1, index + 1, displayType)) {
      transaction = transaction.insert(blockEnd, equation);
      insertedFrom = blockEnd;
      caretAfter = blockEnd + equation.nodeSize;
    } else {
      // No display equation may stand here (a list item, a cell): inline at the caret.
      const at = target.pos;
      const $at = state.doc.resolve(at);
      if (!$at.parent.canReplaceWith($at.index(), $at.index(), inlineType)) return null;
      const inline = inlineType.create(inkEquationAttrs(reading, reading.latex));
      transaction = transaction.insert(at, inline);
      insertedFrom = at;
      caretAfter = at + inline.nodeSize;
    }
    // After a display equation the caret goes on the line below it, so the
    // next piece of writing (or typing) continues there: a fresh paragraph
    // when none follows.
    if (transaction.doc.nodeAt(insertedFrom)?.type === displayType) {
      const $after = transaction.doc.resolve(caretAfter);
      if ($after.nodeAfter?.isTextblock) {
        caretAfter += 1;
      } else if (paragraphType && $after.parent.canReplaceWith($after.index(), $after.index(), paragraphType)) {
        transaction = transaction.insert(caretAfter, paragraphType.create());
        caretAfter += 1;
      }
    }
  } else {
    if (!paragraphType) return null;
    const lines = reading.text.split("\n");
    const at = target.pos;
    const $at = state.doc.resolve(at);
    const before = $at.parentOffset > 0 ? state.doc.textBetween(at - 1, at, "\n", " ") : "";
    const after = $at.parentOffset < $at.parent.content.size ? state.doc.textBetween(at, at + 1, "\n", " ") : "";
    const first = `${before && !/\s/.test(before) ? " " : ""}${lines[0] ?? ""}${after && !/\s/.test(after) ? " " : ""}`;
    if (first) transaction = transaction.insert(at, schema.text(first, inkTextMarks(schema, $at, lineSize(0))));
    insertedFrom = at + (before && !/\s/.test(before) ? 1 : 0);
    caretAfter = at + first.length - (after && !/\s/.test(after) ? 1 : 0);
    if (lines.length > 1) {
      const $block = state.doc.resolve(blockPos);
      if (!$block.parent.canReplaceWith($block.index() + 1, $block.index() + 1, paragraphType)) return null;
      const paragraphs = textParagraphs(lines.slice(1), 1);
      const insertAt = transaction.mapping.map(blockEnd);
      transaction = transaction.insert(insertAt, paragraphs);
      const last = paragraphs[paragraphs.length - 1]!;
      caretAfter = insertAt + paragraphs.reduce((size, node) => size + node.nodeSize, 0) - last.nodeSize + 1 + last.content.size;
    }
  }
  // The strokes go, in the same step.
  const removal = transaction.mapping.maps.length;
  for (const pos of [...positions].sort((a, b) => b - a)) {
    const node = state.doc.nodeAt(pos);
    if (!node) return null;
    const from = transaction.mapping.map(pos, 1);
    const landed = transaction.doc.nodeAt(from);
    if (!landed || !landed.eq(node)) return null;
    transaction = transaction.delete(from, from + landed.nodeSize);
  }
  const afterRemoval = transaction.mapping.slice(removal);
  const caretPos = afterRemoval.map(caretAfter, -1);
  transaction = transaction.setSelection(
    inkCaretNear(transaction.doc, caretPos) ??
      Selection.near(transaction.doc.resolve(Math.max(0, Math.min(transaction.doc.content.size, caretPos))), 1),
  );
  const from = afterRemoval.map(insertedFrom, 1);
  const equation = insertedNode ? transaction.doc.nodeAt(from) ?? undefined : undefined;
  return { transaction, placement: { from, to: Math.max(from, caretPos), node: insertedNode, equation } };
}

/**
 * Where the equation a reading made stands in the document now: the node as
 * inserted, or the equation of that kind that still says what it said,
 * nearest to where it was placed. The page layout re-creates a block when it
 * stamps where the block sits, and strokes drawn since have moved every
 * position after them, so neither the object nor the position it was
 * inserted at finds it a moment later (every continuation fell back to a
 * second equation). Null when it is gone or was edited meanwhile.
 */
export function documentInkEquationPosition(
  doc: ProseMirrorNode,
  equation: ProseMirrorNode,
  near?: number,
): number | null {
  let exact = -1;
  let same: { pos: number; distance: number } | null = null;
  doc.descendants((node, pos) => {
    if (exact >= 0) return false;
    if (node === equation) {
      exact = pos;
      return false;
    }
    if (node.type === equation.type && node.attrs.latex === equation.attrs.latex) {
      const distance = Math.abs(pos - (near ?? pos));
      if (!same || distance < same.distance) same = { pos, distance };
    }
    return true;
  });
  if (exact >= 0) return exact;
  const found = same as { pos: number; distance: number } | null;
  return found ? found.pos : null;
}

/**
 * More writing right after an equation it just made (e then a superscript
 * ix, written with a pause between): the whole writing was read again, so
 * that equation takes the new reading and the new strokes go, one Undo step.
 * False, with nothing changed, when the equation or a stroke is gone.
 */
export function extendDocumentInkEquation(
  view: EditorView,
  strokes: readonly ProseMirrorNode[],
  equation: ProseMirrorNode,
  latex: string,
  placed?: (placement: DocumentInkReadingPlacement) => void,
  /** Where that equation was placed, to tell it from another that says the same. */
  near?: number,
): boolean {
  if (!view.editable) return false;
  const { state } = view;
  const positions = documentInkPositionsOf(state.doc, strokes);
  if (!positions) return false;
  const equationPos = documentInkEquationPosition(state.doc, equation, near) ?? -1;
  const standing = equationPos >= 0 ? state.doc.nodeAt(equationPos) : null;
  if (!standing) return false;
  let transaction = state.tr.setNodeMarkup(equationPos, undefined, { ...standing.attrs, latex });
  for (const pos of [...positions].sort((a, b) => b - a)) {
    const node = state.doc.nodeAt(pos);
    const from = transaction.mapping.map(pos, 1);
    const landed = transaction.doc.nodeAt(from);
    if (!node || !landed || !landed.eq(node)) return false;
    transaction = transaction.delete(from, from + landed.nodeSize);
  }
  const from = transaction.mapping.map(equationPos, 1);
  const updated = transaction.doc.nodeAt(from);
  if (!updated) return false;
  view.dispatch(closeHistory(transaction));
  placed?.({ from, to: from + updated.nodeSize, node: true, equation: updated });
  return true;
}

/**
 * Insert one shape drawn with Lines > Curve / Freeform: Shape / Freeform:
 * Scribble. `box` is the outline's box in CLIENT pixels; the shape anchors to
 * the paragraph under its top-left corner (or the caret's, off the text),
 * floats In Front Of Text as Word draws a new shape, and is selected.
 */
/**
 * Insert > Shapes drawn with the crosshair (Word's click-and-drag insertion):
 * the gallery shape's own attributes (`documentShapeInsertAttrs`) in the box
 * the user drew, anchored like a drawn stroke to the paragraph under the
 * press and floating In Front Of Text, as Word places a drawn shape. `box` is
 * in CLIENT pixels; a plain click already carries the default size.
 */
export function insertDocumentDrawnShape(
  view: EditorView,
  box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly flipV?: boolean },
  shapeAttrs: DocumentShapeAttrs,
): boolean {
  const shapeType = view.state.schema.nodes[SHAPE_NODE_NAME];
  if (!shapeType || !view.editable) return false;
  let origin: InkStrokeOrigin | null = null;
  try {
    origin = inkStrokeOrigin(view, { x: box.left, y: box.top });
  } catch {
    // A press beside the pages, or a document with no hit testing: the
    // caret's paragraph anchors the shape instead.
    origin = null;
  }
  if (!origin) {
    const insertPos = inkAnchorBlockPos(view, view.state.selection.from);
    origin = insertPos === null ? null : inkOriginOfBlock(view, insertPos);
  }
  if (!origin) return false;
  const emu = (value: number, scale: number) => Math.round((value / scale) * DOCUMENT_SHAPE_EMU_PER_PX);
  const attrs = normalizeDocumentShapeAttrs({
    ...shapeAttrs,
    xEmu: emu(box.left - origin.columnLeftClient, origin.scaleX),
    yEmu: emu(box.top - origin.blockTopClient, origin.scaleY),
    widthEmu: Math.max(DOCUMENT_SHAPE_MIN_EDGE_EMU, emu(box.width, origin.scaleX)),
    heightEmu: Math.max(DOCUMENT_SHAPE_MIN_EDGE_EMU, emu(box.height, origin.scaleY)),
    ...(box.flipV ? { flipV: true } : {}),
    wrapMode: "inFrontOfText",
    relativeHeight: nextRelativeHeight(view.state.doc),
    zOrderStackComplete: true,
  });
  // A text box opens with its words as a story (one empty paragraph), so the
  // caret is in it and the first key types there, as PowerPoint and Word
  // leave a drawn text box. Every other shape is drawn selected.
  const nodeAttrs: Readonly<Record<string, unknown>> = { ...attrs };
  const story =
    attrs.isTextBox && documentShapeTakesStory(nodeAttrs)
      ? documentShapeStoryFromLegacy(view.state.schema, nodeAttrs, "")
      : [];
  const node = shapeType.createChecked({ ...attrs, floatAnchor: documentInkFloatAnchor(attrs) }, story);
  // Shapes already anchored at this paragraph stay ahead: a shape drawn later
  // follows the earlier ones, as Word stacks and lists them.
  let insertPos = origin.insertPos;
  for (;;) {
    const ahead = view.state.doc.nodeAt(insertPos);
    if (!ahead || ahead.type !== shapeType) break;
    insertPos += ahead.nodeSize;
  }
  const $insert = view.state.doc.resolve(insertPos);
  if (!$insert.parent.canReplaceWith($insert.index(), $insert.index(), shapeType)) return false;
  let transaction = closeHistory(view.state.tr.insert(insertPos, node));
  const caret = story.length
    ? Selection.findFrom(transaction.doc.resolve(insertPos + 1), 1, true)
    : null;
  transaction = transaction.setSelection(caret ?? NodeSelection.create(transaction.doc, insertPos));
  view.dispatch(transaction.scrollIntoView());
  view.focus();
  return true;
}

export function insertDocumentFreeformShape(
  view: EditorView,
  box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  customPath: PresentationCustomPath,
  paint: { readonly fill: string; readonly outline: string; readonly outlineWidthPt: number },
): boolean {
  const shapeType = view.state.schema.nodes[SHAPE_NODE_NAME];
  if (!shapeType || !view.editable) return false;
  let origin = inkStrokeOrigin(view, { x: box.left, y: box.top });
  if (!origin) {
    const insertPos = inkAnchorBlockPos(view, view.state.selection.from);
    origin = insertPos === null ? null : inkOriginOfBlock(view, insertPos);
  }
  if (!origin) return false;
  const emu = (value: number, scale: number) => Math.round((value / scale) * DOCUMENT_SHAPE_EMU_PER_PX);
  const attrs = normalizeDocumentShapeAttrs({
    // The nearest auto-shape for a host that draws only presets; the custom
    // path wins everywhere else (as for a Draw-tab stroke).
    preset: "rect",
    customPath,
    xEmu: emu(box.left - origin.columnLeftClient, origin.scaleX),
    yEmu: emu(box.top - origin.blockTopClient, origin.scaleY),
    widthEmu: Math.max(DOCUMENT_SHAPE_MIN_EDGE_EMU, emu(box.width, origin.scaleX)),
    heightEmu: Math.max(DOCUMENT_SHAPE_MIN_EDGE_EMU, emu(box.height, origin.scaleY)),
    fill: customPath.closed ? paint.fill : "none",
    outline: paint.outline,
    outlineWidthPt: paint.outlineWidthPt,
    outlineStyle: "solid",
    wrapMode: "inFrontOfText",
    relativeHeight: nextRelativeHeight(view.state.doc),
    zOrderStackComplete: true,
  });
  if (!attrs.customPath) return false;
  const node = shapeType.createChecked({ ...attrs, floatAnchor: documentInkFloatAnchor(attrs) });
  const $insert = view.state.doc.resolve(origin.insertPos);
  if (!$insert.parent.canReplaceWith($insert.index(), $insert.index(), shapeType)) return false;
  let transaction = closeHistory(view.state.tr.insert(origin.insertPos, node));
  transaction = transaction.setSelection(NodeSelection.create(transaction.doc, origin.insertPos));
  view.dispatch(transaction.scrollIntoView());
  view.focus();
  return true;
}

/**
 * A floating object over the page, In Front Of Text, at `box` (CLIENT
 * pixels), anchored as a stroke drawn there is (the paragraph under its
 * top-left corner, on that page): the node and where it goes, or null.
 */
function documentFloatingObjectAt(
  view: EditorView,
  box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  shapeAttrs: DocumentShapeAttrs | Readonly<Record<string, unknown>>,
  story: readonly ProseMirrorNode[] = [],
): { insertPos: number; node: ProseMirrorNode; scale: number } | null {
  const shapeType = view.state.schema.nodes[SHAPE_NODE_NAME];
  if (!shapeType) return null;
  let origin: InkStrokeOrigin | null = null;
  try {
    const piece = inkStrokePieces(view, [{ x: box.left, y: box.top }])[0];
    origin = inkStrokeOrigin(view, { x: box.left, y: box.top }, piece?.sheet ?? null);
  } catch {
    origin = null;
  }
  if (!origin) {
    const insertPos = inkAnchorBlockPos(view, view.state.selection.from);
    origin = insertPos === null ? null : inkOriginOfBlock(view, insertPos);
  }
  if (!origin) return null;
  const emu = (value: number, scale: number) => Math.round((value / scale) * DOCUMENT_SHAPE_EMU_PER_PX);
  const attrs = normalizeDocumentShapeAttrs({
    ...shapeAttrs,
    xEmu: emu(box.left - origin.columnLeftClient, origin.scaleX),
    yEmu: emu(box.top - origin.blockTopClient, origin.scaleY),
    widthEmu: Math.max(DOCUMENT_SHAPE_MIN_EDGE_EMU, emu(box.width, origin.scaleX)),
    heightEmu: Math.max(DOCUMENT_SHAPE_MIN_EDGE_EMU, emu(box.height, origin.scaleY)),
    wrapMode: "inFrontOfText",
    relativeHeight: nextRelativeHeight(view.state.doc),
    zOrderStackComplete: true,
  });
  let node: ProseMirrorNode;
  try {
    node = shapeType.createChecked({ ...attrs, floatAnchor: documentInkFloatAnchor(attrs) }, story);
  } catch {
    return null;
  }
  let insertPos = origin.insertPos;
  for (;;) {
    const ahead = view.state.doc.nodeAt(insertPos);
    if (!ahead || ahead.type !== shapeType) break;
    insertPos += ahead.nodeSize;
  }
  const $insert = view.state.doc.resolve(insertPos);
  if (!$insert.parent.canReplaceWith($insert.index(), $insert.index(), shapeType)) return null;
  return { insertPos, node, scale: origin.scaleX || 1 };
}

/**
 * Pictures put on a handwriting document's page (Insert > Pictures on its
 * Draw tab): each a floating object over the paper, In Front Of Text, at
 * `box` (CLIENT pixels) -- never in a line of text, since the page has
 * none. One history step; the last one is selected. False when none fits.
 */
export function insertDocumentFloatingObjects(
  view: EditorView,
  objects: ReadonlyArray<{
    readonly box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
    readonly attrs: DocumentShapeAttrs | Readonly<Record<string, unknown>>;
  }>,
): boolean {
  if (!view.editable || objects.length === 0) return false;
  let transaction = view.state.tr;
  let last: number | null = null;
  for (const object of objects) {
    const placed = documentFloatingObjectAt(view, object.box, object.attrs);
    if (!placed) continue;
    const at = transaction.mapping.map(placed.insertPos);
    transaction = transaction.insert(at, placed.node);
    last = at;
  }
  if (last === null) return false;
  transaction = closeHistory(transaction).setSelection(NodeSelection.create(transaction.doc, last));
  view.dispatch(transaction);
  return true;
}

/** How much taller than wide (in size) a line's reading must measure to stand for several written lines. */
const INK_JOINED_LINES_RATIO = 2.5;














export function documentInkJoinedLinesSizePt(
  strokes: readonly (readonly { readonly x: number; readonly y: number }[])[],
  text: string,
  sizePt: number,
  fontFamily: string,
  /** A line's typed advance in em (measured in `fontFamily` by default). */
  advanceEmOf: (line: string) => number = (line) =>
    officeInkTextLineWidthPx(line, {
      fontSizePx: 100,
      fontFamily,
      lineHeight: 1.2,
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    }) / 100,
): number {
  const said = text.split("\n").filter((line) => line.trim() !== "");
  const line = said[0];
  if (!line) return sizePt;
  const band = officeInkWritingLinesOf(strokes, said.length)[0];
  if (!band) return sizePt;
  const width = band.right - band.left;
  const height = band.bottom - band.top;
  const advanceEm = advanceEmOf(line.trim());
  if (!(width > 0) || !(height > 0) || !(advanceEm > 0)) return sizePt;
  const byHeight = height / officeInkTextEmExtent(line);
  const byWidth = width / advanceEm;
  if (byHeight < byWidth * INK_JOINED_LINES_RATIO) return sizePt;
  return officeInkNearestSize((Math.sqrt(byHeight * byWidth) * 72) / 96, OFFICE_FONT_SIZE_PRESETS.word);
}

/**
 * Ink to Text / Ink to Math in a handwriting document: the writing becomes a
 * text box where it was written -- the words, or the equation, at the size
 * they were written at, the box sized to them (PowerPoint's "Resize shape to
 * fit text", as the Presentation and Spreadsheet editors place a reading,
 * lib/office-ink-conversion) -- and the strokes leave, in ONE Undo step.
 * Nothing enters the page's text: the box floats over the paper, and the
 * eraser and the lasso take it whole. `placed` hears where it landed.
 */
export function replaceDocumentInkWithTextBox(
  view: EditorView,
  strokes: readonly ProseMirrorNode[],
  reading: DocumentInkReading,
  placed?: (placement: DocumentInkReadingPlacement) => void,
): boolean {
  if (!view.editable) return false;
  const schema = view.state.schema;
  const paragraph = schema.nodes.paragraph;
  const positions = documentInkPositionsOf(view.state.doc, strokes);
  if (!positions || !paragraph) return false;
  const client = documentInkClientStrokes(view, positions);
  const points = client?.flat() ?? [];
  if (points.length === 0) return false;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const written = {
    left: Math.min(...xs),
    top: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  };
  const first = view.nodeDOM(positions[0]!);
  const sheet = (first instanceof Element ? first.closest<HTMLElement>(PAGE_SHEET_SELECTOR) : null) ?? view.dom;
  const scale = documentViewScale(sheet).scaleX || 1;
  const textBox = documentShapeTextBoxDefaultAttrs("horizontal");
  const sizes = reading.kind === "text" ? reading.sizesPt ?? documentInkWrittenSizes(view, strokes, reading.text) : null;
  const readPt = sizes?.find((size): size is number => typeof size === "number" && size > 0) ?? 16;
  const textPt =
    reading.kind === "text" && !reading.sizesPt && client
      ? documentInkJoinedLinesSizePt(
          client.map((stroke) => stroke.map((point) => ({ x: point.x / scale, y: point.y / scale }))),
          reading.text,
          readPt,
          textBox.textFontFamily,
        )
      : readPt;
  const mathSize = reading.kind === "math" ? reading.fontSize ?? documentInkWrittenEquationSize(view, strokes, reading.latex) : null;
  const fontSizePx = reading.kind === "math" ? Number.parseFloat(mathSize ?? "") || (textPt * 96) / 72 : (textPt * 96) / 72;
  const insets = { left: 9.6, right: 9.6, top: 4.8, bottom: 4.8 };
  // The box is measured in the face it draws its words in (the text box's
  // own, Arial), and may grow up to the page's right edge, as the deck's
  // reading grows to the slide's (lib/office-ink-conversion). Measured in
  // Calibri, which a Mac with Office has and which is narrower, a line of
  // writing came out too narrow for its Arial words and broke in two: two
  
  
  const sheetRight = sheet.getBoundingClientRect().right;
  const roomRight = sheetRight > written.left ? (sheetRight - written.left) / scale : undefined;
  const fitted =
    reading.kind === "text"
      ? officeInkTextBoxSize(
          reading.text,
          { fontSizePx, fontFamily: textBox.textFontFamily, lineHeight: 1.2, insets },
          { width: written.width / scale, height: written.height / scale },
          roomRight,
        )
      : {
          width: Math.max(written.width / scale, fontSizePx * Math.max(2, reading.latex.length * 0.45) + insets.left + insets.right),
          height: Math.max(written.height / scale, fontSizePx * 1.6 + insets.top + insets.bottom),
        };
  const box = {
    left: written.left,
    top: written.top,
    width: fitted.width * scale,
    height: fitted.height * scale,
  };
  const base: Readonly<Record<string, unknown>> = {
    ...textBox,
    textFontSizePt: Math.round((fontSizePx * 72) / 96 * 10) / 10,
  };
  let story: ProseMirrorNode[] = [];
  if (reading.kind === "text") {
    story = documentShapeStoryFromLegacy(schema, base, reading.text);
  } else {
    const inlineType = schema.nodes[EQUATION_NODE_BY_PLACEMENT.inline];
    if (!inlineType) return false;
    try {
      story = [paragraph.create(null, inlineType.create(inkEquationAttrs(reading, reading.latex)))];
    } catch {
      return false;
    }
  }
  const object = documentFloatingObjectAt(view, box, base, story);
  if (!object) return false;
  let transaction = view.state.tr;
  for (const pos of [...positions].sort((a, b) => b - a)) {
    const node = transaction.doc.nodeAt(pos);
    if (node) transaction = transaction.delete(pos, pos + node.nodeSize);
  }
  const at = transaction.mapping.map(object.insertPos);
  transaction = transaction.insert(at, object.node);
  // The box fits its height to its words a frame later (Resize shape to fit
  // text): that fit is undone with the reading, not as an Undo step of its
  // own (lib/collab/paged-history-meta).
  view.dispatch(
    closeHistory(transaction).setMeta(DOCUMENT_INK_READING_META, true).setMeta(PAGED_AWAITS_FOLLOW_UP_META, true),
  );
  placed?.({ from: at, to: at + object.node.nodeSize, node: true });
  return true;
}

/** A run of text a reading became, as document positions (`to` after its last character). */
export interface DocumentInkTextRange {
  readonly from: number;
  readonly to: number;
}

/** The text a reading became, its lines joined by "\n" (empty when the range is gone). */
export function documentInkRangeText(doc: ProseMirrorNode, range: DocumentInkTextRange): string {
  const size = doc.content.size;
  if (!(range.from >= 0 && range.to <= size && range.to >= range.from)) return "";
  return doc.textBetween(range.from, range.to, "\n");
}

/** The letter right against `pos` on one side in its line (null: a space, an object, the line's edge). */
function documentInkLetterBeside(doc: ProseMirrorNode, pos: number, side: -1 | 1): string | null {
  if (!(pos >= 0 && pos <= doc.content.size)) return null;
  const $pos = doc.resolve(pos);
  const node = side < 0 ? $pos.nodeBefore : $pos.nodeAfter;
  if (!node?.isText || !node.text) return null;
  const letter = side < 0 ? node.text.slice(-1) : node.text.slice(0, 1);
  return /\s/.test(letter) ? null : letter;
}

/**
 * Whether a change typed on at either end of a converted text (`range` in
 * `before`, `next` in `after`): a new letter now stands against it, so it
 * reads as another word and its other readings no longer apply. A space
 * typed after it, or an object put beside it, is not.
 */
export function documentInkRangeRetyped(
  before: ProseMirrorNode,
  range: DocumentInkTextRange,
  after: ProseMirrorNode,
  next: DocumentInkTextRange,
): boolean {
  const start = documentInkLetterBeside(after, next.from, -1);
  const end = documentInkLetterBeside(after, next.to, 1);
  return (
    (start !== null && start !== documentInkLetterBeside(before, range.from, -1)) ||
    (end !== null && end !== documentInkLetterBeside(before, range.to, 1))
  );
}

/**
 * The row of the text of `range` a client point is on (a few pixels above
 * and below it, but not past either end: a full stop written just after the
 * word is writing, not a tap on it), or null.
 */
export function documentInkRangeRowAt(
  view: EditorView,
  range: DocumentInkTextRange,
  x: number,
  y: number,
): { left: number; top: number; right: number; bottom: number } | null {
  if (range.to <= range.from) return null;
  const start = view.domAtPos(range.from);
  const end = view.domAtPos(range.to);
  const dom = view.dom.ownerDocument.createRange();
  dom.setStart(start.node, start.offset);
  dom.setEnd(end.node, end.offset);
  if (typeof dom.getClientRects !== "function") return null;
  const slop = 4;
  const row = Array.from(dom.getClientRects()).find(
    (rect) => rect.width > 0 && x >= rect.left && x <= rect.right && y >= rect.top - slop && y <= rect.bottom + slop,
  );
  return row ? { left: row.left, top: row.top, right: row.right, bottom: row.bottom } : null;
}

/**
 * Put `text` in place of the reading at `range` (a correction from its
 * alternatives), each line in the line it replaces, the run's marks kept
 * (its written size), in one Undo step. The new range, or null when the
 * lines do not pair up or nothing could change.
 */
export function replaceDocumentInkRangeText(
  view: EditorView,
  range: DocumentInkTextRange,
  text: string,
): DocumentInkTextRange | null {
  if (!view.editable) return null;
  const { doc } = view.state;
  const segments: { from: number; to: number }[] = [];
  doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (!node.isTextblock) return true;
    const from = Math.max(range.from, pos + 1);
    const to = Math.min(range.to, pos + 1 + node.content.size);
    if (to >= from) segments.push({ from, to });
    return false;
  });
  const lines = text.split("\n");
  if (segments.length === 0 || lines.length !== segments.length) return null;
  let transaction = view.state.tr;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]!;
    const line = lines[index]!;
    transaction = line
      ? transaction.insertText(line, segment.from, segment.to)
      : transaction.delete(segment.from, segment.to);
  }
  if (!transaction.docChanged) return null;
  const from = transaction.mapping.map(range.from, -1);
  const to = transaction.mapping.map(range.to, 1);
  view.dispatch(closeHistory(transaction).setMeta(DOCUMENT_INK_TAKEN_OUT_BY_READER_META, true));
  return { from, to };
}
