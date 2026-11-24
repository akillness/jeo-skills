/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A stroke of ink drawn in its sheet's layer from its attributes alone.
 *
 * The drawing is the node view's own (`paintShape` on the same attributes,
 * through `paintDocumentInkForLayer`): pressure, pencil grain, effect pens,
 * cut ends and the highlighter's blend come out as the node view paints them.
 * It is made once per attributes object (a node's attributes never change in
 * place) and placed on its sheet by moving it (`placeInkLayerDrawing`), so a
 * sheet drawn again, or a stroke coming back to the layer after it was
 * selected, costs no painting.
 *
 * One stroke is one `<svg data-ink-stroke>` positioned in the layer's
 * user space (the sheet's pixels): its own viewBox draws the stroke in its
 * canvas, as the node view's SVG fills its canvas. A turned or mirrored
 * stroke is drawn inside a group turning it about its canvas's centre, as the
 * node view turns its `paint` and mirrors its SVG.
 */
import { normalizeDocumentShapeAttrs, normalizeInkTape, type DocumentShapeAttrs } from "../../../../lib/document-shapes";
import { isDocumentInkShapeAttrs } from "../../../../lib/document-ink";
import { documentInkPaintsInLayer, paintDocumentInkForLayer } from "./documentShapeExtension";
import { inkStrokePlacedFromData, type InkStrokeBox } from "./paged/inkStrokePlacement";

const SVG_NS = "http://www.w3.org/2000/svg";
/** On a stroke's drawing in a layer. */
export const INK_LAYER_STROKE_ATTR = "data-ink-stroke";
/** On the group turning a turned or mirrored stroke. */
const TURN_ATTR = "data-ink-stroke-turn";

export interface InkLayerDrawing {
  /** The drawing: moved into a sheet's layer, at most one at a time. */
  readonly element: SVGSVGElement;
  /** The highlighter multiplies over the page (its layer's blend). */
  readonly blend: "normal" | "multiply";
  /** The attributes it was painted from (normalized). */
  readonly attrs: DocumentShapeAttrs;
}

const normalized = new WeakMap<object, DocumentShapeAttrs>();
const drawings = new WeakMap<object, InkLayerDrawing | null>();

/** A node's attributes normalized, once per attributes object. */
export function inkStrokeAttrs(nodeAttrs: Readonly<Record<string, unknown>>): DocumentShapeAttrs {
  let value = normalized.get(nodeAttrs);
  if (!value) {
    value = normalizeDocumentShapeAttrs(nodeAttrs);
    normalized.set(nodeAttrs, value);
  }
  return value;
}

/** inkStrokeDrawsInLayer, per attribute object. */
const drawsInLayer = new WeakMap<object, boolean>();

/** What a node must be for its sheet's layer to draw it: a stroke of ink with
 * no words, no tape, placed from its column and paragraph at plain offsets.
 * The layer draws its picture (`inkLayerDrawing`) only when that works too. */
export function inkStrokeDrawsInLayer(node: {
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly childCount: number;
}): boolean {
  if (node.childCount > 0) return false;
  // A node's attribute object never changes (ProseMirror makes a new one for
  // a new value): read once, not again on every stroke landing for every
  // stroke of the page (its path and anchor validated each time).
  const known = drawsInLayer.get(node.attrs);
  if (known !== undefined) return known;
  const value = attrsDrawInLayer(node.attrs);
  drawsInLayer.set(node.attrs, value);
  return value;
}

function attrsDrawInLayer(nodeAttrs: Readonly<Record<string, unknown>>): boolean {
  if (!isDocumentInkShapeAttrs(nodeAttrs)) return false;
  if (normalizeInkTape(nodeAttrs.inkTape)) return false;
  const attrs = inkStrokeAttrs(nodeAttrs);
  if (attrs.text || !documentInkPaintsInLayer(attrs)) return false;
  // A mirrored stroke: the node view mirrors its SVG by CSS, which WebKit
  // rasterizes a fraction of a pixel apart from a mirror inside the layer's
  // drawing (a printed page's edges differed). Its node view draws it.
  if (attrs.flipH || attrs.flipV) return false;
  return inkStrokePlacedFromData(nodeAttrs.floatAnchor, attrs);
}

/**
 * The drawing of the stroke with these attributes, painted on first use.
 * Null when the layer cannot draw it as its node view would (see
 * `paintDocumentInkForLayer`). `fresh` paints another, uncached.
 */
export function inkLayerDrawing(
  nodeAttrs: Readonly<Record<string, unknown>>,
  doc: Document = document,
  options: { readonly fresh?: boolean } = {},
): InkLayerDrawing | null {
  if (!options.fresh && drawings.has(nodeAttrs)) return drawings.get(nodeAttrs) ?? null;
  const attrs = inkStrokeAttrs(nodeAttrs);
  const painted = paintDocumentInkForLayer(attrs);
  let drawing: InkLayerDrawing | null = null;
  if (painted) {
    const element = painted.svg.ownerDocument === doc ? painted.svg : (doc.importNode(painted.svg, true) as SVGSVGElement);
    element.setAttribute(INK_LAYER_STROKE_ATTR, "");
    element.setAttribute("overflow", "visible");
    if (!element.hasAttribute("preserveAspectRatio")) element.setAttribute("preserveAspectRatio", "none");
    // A highlighter multiplies over the strokes under it in its run too, as
    // each stroke's own view multiplied over everything under it.
    if (painted.blend === "multiply") element.style.mixBlendMode = "multiply";
    drawing = { element, blend: painted.blend, attrs };
  }
  // A second node holding the very same attributes object (a copy put in
  // twice) asks for its own drawing: the cached one stands for the first.
  if (!options.fresh) drawings.set(nodeAttrs, drawing);
  return drawing;
}

const number = (value: number): string => String(Math.round(value * 1000) / 1000);

/**
 * The element a layer holds for `drawing` placed at `box` on its sheet. A
 * stroke neither turned nor mirrored is its drawing itself, positioned; one
 * that is sits in a group turning it about its canvas's centre (the group is
 * made once and kept with the drawing).
 */
export function placeInkLayerDrawing(drawing: InkLayerDrawing, box: InkStrokeBox): SVGElement {
  const { element } = drawing;
  element.setAttribute("width", number(box.width));
  element.setAttribute("height", number(box.height));
  const turned = box.rotation !== 0 || box.flipH || box.flipV;
  let holder = turnGroupOf(element);
  if (!turned) {
    element.setAttribute("x", number(box.left));
    element.setAttribute("y", number(box.top));
    if (holder) holder.replaceWith(element);
    return element;
  }
  element.setAttribute("x", "0");
  element.setAttribute("y", "0");
  if (!holder) {
    holder = element.ownerDocument.createElementNS(SVG_NS, "g") as SVGElement;
    holder.setAttribute(TURN_ATTR, "");
    element.replaceWith(holder);
    holder.append(element);
  }
  const cx = box.width / 2;
  const cy = box.height / 2;
  holder.setAttribute(
    "transform",
    `translate(${number(box.left + cx)} ${number(box.top + cy)})` +
      (box.rotation ? ` rotate(${number(box.rotation)})` : "") +
      (box.flipH || box.flipV ? ` scale(${box.flipH ? -1 : 1} ${box.flipV ? -1 : 1})` : "") +
      ` translate(${number(-cx)} ${number(-cy)})`,
  );
  return holder;
}


function turnGroupOf(element: SVGSVGElement): SVGElement | null {
  const parent = element.parentNode;
  return parent instanceof Element && parent.hasAttribute(TURN_ATTR) ? (parent as SVGElement) : null;
}

/** The layer element standing for `drawing` (its turning group, or itself). */
export function inkLayerDrawingHolder(drawing: InkLayerDrawing): SVGElement {
  return turnGroupOf(drawing.element) ?? drawing.element;
}
