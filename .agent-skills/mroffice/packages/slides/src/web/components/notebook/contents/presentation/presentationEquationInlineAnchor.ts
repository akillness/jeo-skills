"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Where an equation in a line of a slide's words is edited IN PLACE
 * (PowerPoint's Insert > Equation with the caret in a text box, and a click
 * on an equation among words): the caret's or the equation's place on the
 * slide's design surface, and the size and colour its line is drawn in.
 *
 * The slide draws its words in a textarea (and its mirror) or a rich
 * preview, neither of which can hold a live equation field, so the field is
 * drawn over the line at that place (`PresentationInlineEquationEditor`) and
 * the equation joins the words when it commits. While it is open it covers
 * what it will replace -- the selected words, or the equation it edits -- on
 * the backdrop the words are drawn on.
 */

import {
  presentationTextRangeClientRects,
  type PresentationPreviewPointResolver,
} from "../../../../lib/presentation/PresentationFindHighlights";
import { presentationPreviewDomPoint } from "@mrnote/core/web/lib/presentation/text-selection.ts";

/** Design px on the slide canvas (the in-place editor's containing block). */
export interface PresentationInlineEquationAnchor {
  /** Where the equation starts on its line. */
  readonly left: number;
  /** The line's box: the equation is centred on it. */
  readonly top: number;
  readonly height: number;
  /** What the draft covers while open (the equation edited, the words it replaces). */
  readonly minWidth: number;
  readonly fontSizePx: number;
  readonly color: string | null;
  /** The colour the words are drawn on, so the draft hides what it covers. */
  readonly backdrop: string;
}

type ClientBox = { left: number; top: number; right: number; bottom: number };

const resolvePoint: PresentationPreviewPointResolver = presentationPreviewDomPoint;

function cssEscapeAttr(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

/** The canvas's on-screen scale (its design size is drawn scaled by zoom). */
function canvasScale(canvas: HTMLElement): number {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.offsetWidth > 0 ? rect.width / canvas.offsetWidth : 1;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** An element's own scale on screen relative to its layout size (autofit, zoom). */
function elementScale(element: Element): number {
  if (!(element instanceof HTMLElement) || element.offsetHeight <= 0) return 1;
  const scale = element.getBoundingClientRect().height / element.offsetHeight;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function rgba(value: string): [number, number, number, number] | null {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(value.trim());
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? Number.parseFloat(match[4]) / 100 : Number(match[4]);
  return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
}

/**
 * The opaque colour the words at `from` are drawn on (the box's fill, else
 * the slide's), or a plain backdrop that keeps `textColor` readable when
 * they stand on a picture, a gradient or nothing the page states.
 */
function backdropOf(from: Element, canvas: HTMLElement, textColor: string | null): string {
  const view = canvas.ownerDocument.defaultView;
  for (let element: Element | null = from; element && view; element = element.parentElement) {
    const computed = view.getComputedStyle(element);
    if (computed.backgroundImage && computed.backgroundImage !== "none") break;
    const colour = rgba(computed.backgroundColor);
    if (colour && colour[3] >= 0.98) return computed.backgroundColor;
    if (colour && colour[3] > 0.02) break;
    // A shape's fill is drawn in its SVG, not as a CSS background: the
    // words in a dark shape stood on a white box while their equation was
    
    if (element instanceof HTMLElement && element.dataset.blockId !== undefined) {
      const fill = shapeFillOf(element, view);
      if (fill) return fill;
      break;
    }
    if (element === canvas) break;
  }
  const text = textColor ? rgba(textColor) : null;
  const luminance = text ? (0.2126 * text[0] + 0.7152 * text[1] + 0.0722 * text[2]) / 255 : 0;
  return luminance > 0.6 ? "rgb(38, 38, 38)" : "rgb(255, 255, 255)";
}

/** The solid colour a shape's SVG geometry is filled with, or null (a gradient, a picture, none). */
function shapeFillOf(block: HTMLElement, view: Window): string | null {
  for (const shape of block.querySelectorAll<SVGGeometryElement>("svg path, svg rect, svg ellipse, svg polygon, svg circle")) {
    const fill = view.getComputedStyle(shape).fill;
    if (!fill || fill === "none" || fill.startsWith("url(")) continue;
    const colour = rgba(fill);
    if (colour && colour[3] >= 0.98) return fill;
  }
  return null;
}

/** The colour of the words a box draws (its drawn label when the surface typed in draws none). */
function drawnWordsColor(from: Element, view: Window): string | null {
  const block = from.closest<HTMLElement>("[data-block-id]");
  if (!block) return null;
  for (const element of block.querySelectorAll("*")) {
    // Only HTML words are read: KaTeX draws an equation twice (HTML and a
    // MathML twin) and the HTML copy carries the words' colour; a DOM with
    // no MathML styling (jsdom) throws on the twin's computed style, which
    // closed the equation editor (6723bb130d).
    if (!(element instanceof HTMLElement)) continue;
    if (!Array.from(element.childNodes).some((node) => node.nodeType === 3 && node.textContent?.trim())) continue;
    const colour = view.getComputedStyle(element).color;
    const parsed = rgba(colour);
    if (parsed && parsed[3] >= 0.5) return colour;
  }
  return null;
}

function anchorFrom(
  canvas: HTMLElement,
  box: ClientBox,
  minWidthClient: number,
  styleSource: Element,
): PresentationInlineEquationAnchor {
  const view = canvas.ownerDocument.defaultView;
  const canvasRect = canvas.getBoundingClientRect();
  const scale = canvasScale(canvas);
  const computed = view?.getComputedStyle(styleSource);
  const size = Number.parseFloat(computed?.fontSize ?? "");
  // The words' own scale under the canvas's (a box that shrinks text on
  // overflow draws them scaled): the draft is drawn at the size seen.
  const ownScale = elementScale(styleSource) / scale;
  // A bridge textarea under drawn words draws none itself (transparent).
  const drawn = computed?.color ? rgba(computed.color) : null;
  const color =
    computed?.color && !(drawn && drawn[3] < 0.02) ? computed.color : view ? drawnWordsColor(styleSource, view) : null;
  return {
    left: (box.left - canvasRect.left) / scale - canvas.clientLeft,
    top: (box.top - canvasRect.top) / scale - canvas.clientTop,
    height: Math.max(1, (box.bottom - box.top) / scale),
    minWidth: Math.max(0, minWidthClient / scale),
    fontSizePx: Number.isFinite(size) && size > 0 ? size * (Number.isFinite(ownScale) && ownScale > 0 ? ownScale : 1) : 24,
    color,
    backdrop: backdropOf(styleSource, canvas, color),
  };
}

/** The surface a box's words are drawn in: its preview, else its textarea. */
function wordsSurface(wrapper: HTMLElement): HTMLElement | null {
  return (
    wrapper.querySelector<HTMLElement>('[data-selection-owner="rich-preview"]') ??
    wrapper.querySelector<HTMLElement>('[data-testid="presentation-text-preview"]') ??
    wrapper.querySelector<HTMLElement>("textarea") ??
    null
  );
}

/** The element whose font the words at `offset` are drawn in. */
function styleSourceAt(surface: HTMLElement, offset: number): Element {
  if (surface instanceof HTMLTextAreaElement) return surface;
  try {
    const point = resolvePoint(surface, offset);
    const node = point.node;
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    if (element && surface.contains(element)) return element;
  } catch {
    // The surface's own font, then.
  }
  return surface;
}

/**
 * The anchor for a new equation at `[start, end)` of text block `blockId`'s
 * words (its flat text `text`): at the caret, covering the selected words
 * it replaces. With `append`, a new last line under the words. Null when
 * the box's words are not drawn.
 */
export function presentationEquationCaretAnchor(
  canvas: HTMLElement | null,
  blockId: string,
  text: string,
  start: number,
  end: number,
  options?: { readonly append?: boolean },
): PresentationInlineEquationAnchor | null {
  if (!canvas || typeof window === "undefined") return null;
  const wrapper = canvas.querySelector<HTMLElement>(`[data-block-id="${cssEscapeAttr(blockId)}"]`);
  if (!wrapper) return null;
  const surface = wordsSurface(wrapper);
  const rects = (from: number, to: number) => presentationTextRangeClientRects(wrapper, from, to, resolvePoint);
  const from = Math.max(0, Math.min(text.length, Math.min(start, end)));
  const to = Math.max(0, Math.min(text.length, Math.max(start, end)));
  const surfaceRect = (surface ?? wrapper).getBoundingClientRect();
  const view = canvas.ownerDocument.defaultView;
  const surfaceStyle = surface ? view?.getComputedStyle(surface) : null;
  const scale = canvasScale(canvas);
  const inset = (value: string | undefined) => (Number.parseFloat(value ?? "") || 0) * scale;
  const contentLeft = surfaceRect.left + inset(surfaceStyle?.paddingLeft);
  const contentTop = surfaceRect.top + inset(surfaceStyle?.paddingTop);
  const styleSource = surface ? styleSourceAt(surface, Math.max(0, (options?.append ? text.length : from) - 1)) : wrapper;
  const lineHeightOf = () => {
    const sizePx = Number.parseFloat(view?.getComputedStyle(styleSource).fontSize ?? "") || 24;
    return sizePx * 1.2 * scale;
  };

  if (options?.append) {
    // A new last paragraph: under the last line, at the start of the line.
    const last = text.length > 0 ? rects(text.length - 1, text.length).at(-1) : undefined;
    const top = last ? last.bottom : contentTop;
    const height = last ? last.height || lineHeightOf() : lineHeightOf();
    return anchorFrom(canvas, { left: contentLeft, top, right: contentLeft, bottom: top + height }, 0, styleSource);
  }

  let caret: ClientBox | null = null;
  // The character after the caret on its line, else the one before it.
  if (from < text.length && text[from] !== "\n") {
    const rect = rects(from, from + 1)[0];
    if (rect && rect.height > 0) caret = { left: rect.left, top: rect.top, right: rect.left, bottom: rect.bottom };
  }
  if (!caret && from > 0 && text[from - 1] !== "\n") {
    const rect = rects(from - 1, from).at(-1);
    if (rect && rect.height > 0) caret = { left: rect.right, top: rect.top, right: rect.right, bottom: rect.bottom };
  }
  if (!caret) {
    // An empty line: the collapsed caret's own box, else the line's start.
    const rect = rects(from, from)[0];
    if (rect && rect.height > 0) caret = { left: rect.left, top: rect.top, right: rect.left, bottom: rect.bottom };
  }
  if (!caret) {
    const height = lineHeightOf();
    caret = { left: contentLeft, top: contentTop, right: contentLeft, bottom: contentTop + height };
  }
  // The selected words the equation replaces stay covered while it is open.
  let covered = 0;
  if (to > from) {
    const selected = rects(from, to).filter((rect) => rect.width > 0 && Math.abs(rect.top - caret!.top) < 2);
    if (selected.length) covered = Math.max(...selected.map((rect) => rect.right)) - caret.left;
  }
  return anchorFrom(canvas, caret, covered, styleSource);
}

/** The anchor for editing the equation `atom` draws, over it. */
export function presentationEquationAtomAnchor(
  canvas: HTMLElement | null,
  atom: Element,
): PresentationInlineEquationAnchor | null {
  if (!canvas || typeof window === "undefined" || !canvas.contains(atom)) return null;
  const rect = atom.getBoundingClientRect();
  if (!(rect.width > 0 || rect.height > 0)) return null;
  return anchorFrom(canvas, rect, rect.width, atom);
}

/** The anchor at the caret of a contenteditable surface (a table cell's words). */
export function presentationEquationSelectionAnchor(
  canvas: HTMLElement | null,
  surface: HTMLElement,
): PresentationInlineEquationAnchor | null {
  if (!canvas || typeof window === "undefined" || !canvas.contains(surface)) return null;
  const selection = surface.ownerDocument.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (range && surface.contains(range.startContainer)) {
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
    const first = rects[0] ?? (range.getBoundingClientRect().height > 0 ? range.getBoundingClientRect() : null);
    if (first) {
      const node = range.startContainer;
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
      const covered = range.collapsed
        ? 0
        : Math.max(...rects.filter((rect) => Math.abs(rect.top - first.top) < 2).map((rect) => rect.right)) - first.left;
      return anchorFrom(
        canvas,
        { left: first.left, top: first.top, right: first.left, bottom: first.bottom },
        covered,
        element && surface.contains(element) ? element : surface,
      );
    }
  }
  // No caret drawn: the start of the cell's words.
  const view = surface.ownerDocument.defaultView;
  const style = view?.getComputedStyle(surface);
  const rect = surface.getBoundingClientRect();
  const scale = canvasScale(canvas);
  const left = rect.left + (Number.parseFloat(style?.paddingLeft ?? "") || 0) * scale;
  const top = rect.top + (Number.parseFloat(style?.paddingTop ?? "") || 0) * scale;
  const height = (Number.parseFloat(style?.fontSize ?? "") || 18) * 1.2 * scale;
  return anchorFrom(canvas, { left, top, right: left, bottom: top + height }, 0, surface);
}
