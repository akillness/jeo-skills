/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  sanitizePdfTextBoxRect,
  type PdfTextBoxRectLike,
} from "@mrnote/core/web/lib/pdf/text-box-rect.ts";
import type { TextBoxEditLike } from "../../../../../lib/pdf/text-box-flatten";
import { pdfSourceTextBindingNamesItem } from "../../../../../lib/pdf/source-text-box";
import {
  PDF_NATIVE_TEXT_EDIT_FRAME_RECT_ATTR,
  pdfNativeTextEditFrameClientRect,
} from "../../../../../lib/pdf/native-text-edit-frame-rect";

export { PDF_NATIVE_TEXT_EDIT_FRAME_RECT_ATTR, pdfNativeTextEditFrameClientRect };
import {
  pdfTextInkDisplayRect,
  type PdfTextInkBounds,
} from "../../../../../lib/pdf/native-text-ink-bounds";
import type { PdfNativeTextRunTarget } from "./nativeTextActivation";
import { boxQuarterTurn, boxRectInOwnAxes } from "@mrnote/core/web/lib/pdf/rotated-box.ts";

export const PDF_NATIVE_TEXT_ITEM_INDEX_ATTR = "data-pdf-native-text-item-index";
export const PDF_NATIVE_TEXT_MULTI_SELECTED_ATTR = "data-pdf-native-text-multi-selected";
export const EMPTY_NATIVE_TEXT_RUN_TARGETS: readonly PdfNativeTextRunTarget[] =
  Object.freeze([]);

export function sameNativeTextRunTarget(
  left: PdfNativeTextRunTarget,
  right: PdfNativeTextRunTarget,
): boolean {
  return (
    left.pageNumber === right.pageNumber &&
    left.str === right.str &&
    Math.abs(left.x - right.x) < 0.01 &&
    Math.abs(left.y - right.y) < 0.01
  );
}
export const PDF_NATIVE_TEXT_EDIT_BOX_ATTR = "data-pdf-native-text-edit-box";











/** Where a span's Edit Content frame is drawn, as page fractions
 * "x,y,width,height" (synchronizePdfNativeTextEditFrame); absent, the frame
 * is the span's own box. */
/** The box under the pointer in Edit Content, for its highlight. */
export const PDF_NATIVE_TEXT_HOVERED_ATTR = "data-pdf-native-text-hovered";
/** The frame's dashed outline sits two px outside its box (pdf-viewer.css). */
const NATIVE_TEXT_FRAME_SLACK_PX = 3;
















export function pdfReaderAnnotationPressOf(target: EventTarget | null): "object" | "layer" | null {
  const element = target instanceof Element ? target : null;
  if (!element?.closest(".pdf-viewer__annotation-stack")) return null;
  return element.classList.contains("pdf-viewer__text-box-layer") ? "layer" : "object";
}














export function pdfNativeTextEditBoxAtPoint(
  reached: HTMLElement | null,
  clientX: number,
  clientY: number,
  from?: Element | null,
): HTMLElement | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return reached;
  const layer = (reached ?? from)?.closest?.("[data-pdf-text-layer]") ?? null;
  if (!layer) return reached;
  const slack = NATIVE_TEXT_FRAME_SLACK_PX;
  let inside: HTMLElement | null = null;
  let insideArea = Infinity;
  let near: HTMLElement | null = null;
  let nearArea = Infinity;
  for (const span of layer.querySelectorAll<HTMLElement>(`span[${PDF_NATIVE_TEXT_EDIT_BOX_ATTR}="true"]`)) {
    // A box an edit just moved or retyped is not where the page shows it
    // until the reader has built the boxes again (PdfNativeListTextEditDialog).
    if (span.hasAttribute("data-pdf-native-text-superseded")) continue;
    const frame = pdfNativeTextEditFrameClientRect(span);
    if (!(frame.right > frame.left && frame.bottom > frame.top)) continue;
    const area = (frame.right - frame.left) * (frame.bottom - frame.top);
    if (clientX >= frame.left && clientX <= frame.right && clientY >= frame.top && clientY <= frame.bottom) {
      // Of frames inside one another, the innermost.
      if (area < insideArea) {
        inside = span;
        insideArea = area;
      }
    } else if (
      clientX >= frame.left - slack && clientX <= frame.right + slack &&
      clientY >= frame.top - slack && clientY <= frame.bottom + slack &&
      (span === reached || (near !== reached && area < nearArea))
    ) {
      // On a frame's outline: the span the event came to first.
      near = span;
      nearArea = area;
    }
  }
  if (inside) return inside;
  if (near) return near;
  // No frame claims the point: it is on blank page. The span the browser
  // gave it to keeps it only while that span has no frame laid out yet. A
  // span whose frame is elsewhere does not take it: after a shape was
  // dragged and refilled, a page's spans sat about 100 pt below their
  
  
  if (reached) {
    const own = pdfNativeTextEditFrameClientRect(reached);
    if (own.right > own.left && own.bottom > own.top) return null;
  }
  return reached;
}
/** A point on a page's own text, told on the page (fractions of its box) so
 * it still names the same word after the window around the page has moved. */
export type PdfPageTextEditPoint = Readonly<{ pageNumber: number; fx: number; fy: number }>;
/**
 * The page text under a press, for the Select tool's way into a line (a
 * double click, 「编辑文字」 in the right-click menu), or null where there is
 * none to edit: blank page, a line already open in its editor, a scan (its
 * words are read off a picture, `isScan`).
 */
export function pdfPageTextEditPointAt(
  target: EventTarget | null,
  clientX: number,
  clientY: number,
  isScan: (pageNumber: number) => boolean,
): PdfPageTextEditPoint | null {
  const element = target instanceof Element ? target : null;
  const layer = element?.closest<HTMLElement>("[data-pdf-text-layer]");
  const host = layer?.closest<HTMLElement>(".pdf-viewer__page[data-page-number]");
  if (!element || !layer || !host) return null;
  if (element.closest("[contenteditable]:not([contenteditable='false']), textarea, input")) return null;
  const pageNumber = Number(host.dataset.pageNumber);
  if (!Number.isSafeInteger(pageNumber) || isScan(pageNumber)) return null;
  const span = element.closest<HTMLElement>("span");
  const onText =
    Boolean(span && layer.contains(span) && span.textContent?.trim()) ||
    Boolean(pdfNativeTextEditBoxAtPoint(null, clientX, clientY, layer));
  if (!onText) return null;
  const rect = host.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return null;
  return {
    pageNumber,
    fx: (clientX - rect.left) / rect.width,
    fy: (clientY - rect.top) / rect.height,
  };
}
/** Where that point is in the window now, and the text box holding it (null
 * until the page's boxes are laid out). */
export function pdfPageTextEditBoxAt(
  root: ParentNode | null | undefined,
  at: PdfPageTextEditPoint,
): Readonly<{ box: HTMLElement; clientX: number; clientY: number }> | null {
  const host = root?.querySelector<HTMLElement>(`.pdf-viewer__page[data-page-number="${at.pageNumber}"]`);
  const layer = host?.querySelector<HTMLElement>("[data-pdf-text-layer]");
  const rect = host?.getBoundingClientRect();
  if (!layer || !rect || !(rect.width > 0 && rect.height > 0)) return null;
  const clientX = rect.left + at.fx * rect.width;
  const clientY = rect.top + at.fy * rect.height;
  const box = pdfNativeTextEditBoxAtPoint(null, clientX, clientY, layer);
  return box ? { box, clientX, clientY } : null;
}
export const PDF_NATIVE_TEXT_EDITABLE_ATTR = "data-pdf-native-text-editable";
export const PDF_NATIVE_TEXT_EDIT_SELECTED_ATTR = "data-pdf-native-text-edit-selected";
/** A text box on a rendered page other than the current one: a click on it
 * first makes that page current, then activates the same box. */
export const PDF_NATIVE_TEXT_OTHER_PAGE_ATTR = "data-pdf-native-text-other-page";
export const PDF_NATIVE_TEXT_PARAGRAPH_ID_ATTR = "data-pdf-native-text-paragraph-id";
export const PDF_NATIVE_TEXT_TYPOGRAPHY_BOUND_ATTR =
  "data-pdf-native-text-typography-bound";

export type PdfNativeTextPointerGestureOwner = Readonly<{
  target: HTMLElement;
  generation: string;
}>;

export function claimPdfNativeTextPointerGesture(input: {
  target: HTMLElement;
  activate: () => boolean;
  readGeneration: () => string;
  preventDefault: () => void;
  stopPropagation: () => void;
  clearSelection: () => void;
}): PdfNativeTextPointerGestureOwner | null {
  if (!input.activate()) return null;
  const owner = Object.freeze({
    target: input.target,
    generation: input.readGeneration(),
  });
  input.preventDefault();
  input.stopPropagation();
  input.clearSelection();
  return owner;
}

export function pdfNativeTextPointerGestureOwnsClick(
  owner: PdfNativeTextPointerGestureOwner | null,
  target: HTMLElement | null,
  generation: string,
): boolean {
  return (
    owner !== null && owner.target === target && owner.generation === generation
  );
}

export const nativeTextEditOriginalAttributes = new WeakMap<
  HTMLElement,
  Readonly<{
    ariaDisabled: string | null;
    ariaLabel: string | null;
    role: string | null;
    tabIndex: string | null;
    title: string | null;
  }>
>();

/** Selection feedback is local UI only; it never makes a target editable. */
export function beginPdfNativeTextActivationFeedback(target: HTMLElement): (accepted: boolean) => void {
  const selected = target.getAttribute("data-pdf-native-text-edit-selected");
  const busy = target.getAttribute("aria-busy");
  target.setAttribute("data-pdf-native-text-edit-selected", "true");
  target.setAttribute("data-pdf-native-text-activation-pending", "true");
  target.setAttribute("aria-busy", "true");
  return accepted => {
    target.removeAttribute("data-pdf-native-text-activation-pending");
    if (busy === null) target.removeAttribute("aria-busy"); else target.setAttribute("aria-busy", busy);
    if (!accepted) {
      if (selected === null) target.removeAttribute("data-pdf-native-text-edit-selected");
      else target.setAttribute("data-pdf-native-text-edit-selected", selected);
    }
  };
}

/** The frame's screen pixel (pdf-viewer.css). The text layer sets it to
 * --min-font-size px for pdf.js's spans, which are scaled back down by that
 * much; a box laid out without that scale (an edited line, a paragraph's
 * handle, a fallback span) took it unscaled, and in a Safari with a minimum
 * font size its dashes came out 9 to 12 px thick, 18 to 24 px outside the
 * text. */
export const PDF_TEXT_FRAME_PX_PROPERTY = "--pdf-text-frame-px";
export function unscaledPdfTextFrame(box: HTMLElement): void {
  box.style.setProperty(PDF_TEXT_FRAME_PX_PROPERTY, "1px");
}

export const nativeTextEditGeometryKeys = ["left", "top", "width", "height", "transform", "transformOrigin", "clipPath"] as const;
/** Room the edited line's frame needs outside its box: the dashed outline
 * (2px offset + 1px), the selected one (2px + 2px) and its 3px halo. */
export const PDF_NATIVE_TEXT_EDITED_CLIP = "inset(-8px)";
export const nativeTextEditSourceGeometry = new WeakMap<HTMLElement,
  Pick<CSSStyleDeclaration, (typeof nativeTextEditGeometryKeys)[number]>>();

/** The stored box drawn over a source line: by the line's own id, or by the
 * box's binding to it (pdfSourceTextBindingNamesItem: its item index, or its
 * text where it stands once an edit above moved that index). `transform` is
 * the line's first reader item's. */
export function resolvePdfNativeTextEditedLayout(
  edits: readonly TextBoxEditLike[], page: number, first: number, last: number, sourceText: string,
  transform?: readonly number[],
): TextBoxEditLike | null {
  const nativeId = `native-text:${page}:${first}:${last}`;
  const matches = edits.filter(edit => {
    if (edit.deleted || edit.page !== page - 1) return false;
    if (edit.id === nativeId) return true;
    const binding = edit.sourceText;
    return binding !== undefined && binding.boxId === edit.id && binding.page === page &&
      pdfSourceTextBindingNamesItem(binding, page, { itemIndex: first, str: sourceText, transform });
  });
  return matches.length === 1 ? matches[0] : null;
}










export function pdfTextLayerLocalRect(
  rect: Readonly<{ x: number; y: number; width: number; height: number }>,
  rotation: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  // The layer is the page turned back: the box in the page's own axes.
  return boxRectInOwnAxes(rect, boxQuarterTurn(rotation) ?? 0, pageWidth, pageHeight);
}

/** Ink owns outline AND hit testing; the stored box still owns text wrapping. */
export function synchronizePdfNativeTextEditedOutline(
  span: HTMLElement,
  edit: TextBoxEditLike | null,
  ink: PdfTextInkBounds | null = null,
): void {
  const original = nativeTextEditSourceGeometry.get(span);
  if (!edit) {
    if (original !== undefined) {
      Object.assign(span.style, original);
      span.style.removeProperty(PDF_TEXT_FRAME_PX_PROPERTY);
      nativeTextEditSourceGeometry.delete(span);
      span.removeAttribute("data-pdf-native-text-edited-outline");
    }
    return;
  }
  if (
    [edit.x, edit.y, edit.width, edit.height].some(
      (value) => typeof value !== "number" || !Number.isFinite(value),
    )
  )
    return;
  if (
    Number(edit.width) <= 0 ||
    Number(edit.height) <= 0 ||
    Number(edit.x) < 0 ||
    Number(edit.y) < 0 ||
    Number(edit.x) + Number(edit.width) > 1.000001 ||
    Number(edit.y) + Number(edit.height) > 1.000001
  )
    return;
  const angle = Number(edit.angle ?? 0);
  if (!Number.isFinite(angle)) return;
  const layer = span.closest<HTMLElement>("[data-pdf-text-layer]");
  const rotation = Number(layer?.dataset.mainRotation ?? 0);
  if (![0, 90, 180, 270].includes(rotation)) return;
  const page = layer?.closest<HTMLElement>(".pdf-viewer__page");
  const pageWidth =
    Number.parseFloat(page?.style.width ?? "") || page?.clientWidth || 0;
  const pageHeight =
    Number.parseFloat(page?.style.height ?? "") || page?.clientHeight || 0;
  if (rotation !== 0 && (pageWidth <= 0 || pageHeight <= 0)) return;
  if (original === undefined)
    nativeTextEditSourceGeometry.set(
      span,
      Object.fromEntries(
        nativeTextEditGeometryKeys.map((key) => [key, span.style[key]]),
      ) as Pick<
        CSSStyleDeclaration,
        (typeof nativeTextEditGeometryKeys)[number]
      >,
    );
  const apply = (ink: PdfTextInkBounds | null) => {
    let rect = {
      x: Number(edit.x),
      y: Number(edit.y),
      width: Number(edit.width),
      height: Number(edit.height),
    };
    if (ink && pageWidth > 0 && pageHeight > 0) {
      rect = pdfTextInkDisplayRect(rect, ink, angle, pageWidth, pageHeight);
    }
    const { x, y, width, height } = pdfTextLayerLocalRect(
      rect,
      rotation,
      pageWidth,
      pageHeight,
    );
    Object.assign(span.style, {
      left: `${x * 100}%`,
      top: `${y * 100}%`,
      width: `${width * 100}%`,
      height: `${height * 100}%`,
      transform: `rotate(${angle - rotation}deg)`,
      transformOrigin: "50% 50%",
      // Invisible original text must not hit-test outside the visible ink.
      // A clip path, not `overflow: hidden`: the line's dashed frame is the
      // span's own ::before outline, drawn just outside this box, and
      // overflow clipping cut it off (an edited line lost its frame).
      clipPath: PDF_NATIVE_TEXT_EDITED_CLIP,
    });
    unscaledPdfTextFrame(span);
    span.setAttribute("data-pdf-native-text-edited-outline", "true");
  };
  apply(ink);
}

export const PDF_NATIVE_TEXT_EDIT_FRAME_PROPERTY = "--pdf-native-text-edit-frame";

/** The scale a text-layer span's computed transform applies on each axis;
 * null when the transform rotates or skews (the frame then keeps the span's
 * own box). pdf.js scales every span by scaleX(--scale-x) and, both ways,
 * by 1 / --min-font-size: the vertical one is 1 only where the browser has
 * no minimum font size (Safari with one set: 1/9 to 1/12). */
export function pdfTextLayerSpanScale(
  transform: string,
): Readonly<{ x: number; y: number }> | null {
  if (!transform || transform === "none") return { x: 1, y: 1 };
  const matrix = /^matrix\(([^)]+)\)$/.exec(transform.trim());
  if (!matrix) return null;
  const [a, b, c, d] = matrix[1].split(",").map((value) => Number(value.trim()));
  if (![a, b, c, d].every(Number.isFinite) || b !== 0 || c !== 0 || a <= 0 || d <= 0)
    return null;
  return { x: a, y: d };
}

/**
 * The dashed frame a native line shows before editing is the box the editor
 * opens it in -- baseline minus one em to baseline plus a quarter em over
 * the line's advance (`nativeTextItemLayoutGeometry`) -- not pdf.js's
 * ascent-high span. The span's own box stays as pdf.js laid it (selection,
 * markup and the caret probe read it); the frame is the span's `::before`,
 * inset in em of the span's own font so a CSS zoom keeps it aligned. Edited
 * lines already carry that box on the span itself; a rotated page or line,
 * or a span not yet laid out, keeps the span's box.
 */
export function synchronizePdfNativeTextEditFrame(
  span: HTMLElement,
  layout: PdfTextBoxRectLike & Readonly<{ angle?: number }> | null | undefined,
): void {
  measurePdfNativeTextEditFrame(span, layout)();
}

/**
 * synchronizePdfNativeTextEditFrame in two halves: the reads (the span's
 * computed font and transform, the page's and the span's rects) now, the
 * writes (the frame) in the function returned. A page's boxes measured all
 * first and written after are laid out once; written one by one, each
 * write made the next box's read lay the page out again.
 */
export function measurePdfNativeTextEditFrame(
  span: HTMLElement,
  layout: PdfTextBoxRectLike & Readonly<{ angle?: number }> | null | undefined,
): () => void {
  const keepSpanBox = () => {
    span.style.removeProperty(PDF_NATIVE_TEXT_EDIT_FRAME_PROPERTY);
    span.removeAttribute(PDF_NATIVE_TEXT_EDIT_FRAME_RECT_ATTR);
  };
  if (
    !layout ||
    span.hasAttribute("data-pdf-native-text-edited-outline") ||
    (layout.angle !== undefined && layout.angle !== 0)
  ) {
    return keepSpanBox;
  }
  const rect = sanitizePdfTextBoxRect(layout);
  if (!rect) {
    return keepSpanBox;
  }
  const layer = span.closest<HTMLElement>("[data-pdf-text-layer]");
  const page = layer?.closest<HTMLElement>(".pdf-viewer__page");
  if (!page || Number(layer?.dataset.mainRotation ?? 0) !== 0) {
    return keepSpanBox;
  }
  const view = span.ownerDocument.defaultView;
  const computed = view?.getComputedStyle(span);
  const fontPx = Number.parseFloat(computed?.fontSize ?? "");
  const scale = pdfTextLayerSpanScale(computed?.transform ?? "none");
  // The layout box is a fraction of the page as the text layer draws it:
  // the span is placed in that layer, which a page laid out at another
  // zoom than its last drawing (a late render) does not fill.
  const layerRect = layer?.getBoundingClientRect();
  const frameHost = layer && layerRect && layerRect.width > 0 && layerRect.height > 0 && layer.clientWidth > 0
    ? layer : page;
  const pageRect = frameHost === layer && layerRect ? layerRect : page.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  // Screen px per layout px: an ancestor scale (the page zooming) shows in
  // the rects but not in the computed font size.
  const screenScale = frameHost.clientWidth > 0 ? pageRect.width / frameHost.clientWidth : 0;
  if (
    !(fontPx > 0) ||
    scale === null ||
    !(screenScale > 0) ||
    !(pageRect.width > 0) ||
    !(pageRect.height > 0) ||
    !(spanRect.width > 0) ||
    !(spanRect.height > 0)
  ) {
    return keepSpanBox;
  }
  const target = {
    left: pageRect.left + rect.x * pageRect.width,
    top: pageRect.top + rect.y * pageRect.height,
    right: pageRect.left + (rect.x + rect.width) * pageRect.width,
    bottom: pageRect.top + (rect.y + rect.height) * pageRect.height,
  };
  // Screen px per em of the span's font on each axis. Vertically too the
  // span's own scale counts: read as 1, a Safari with a minimum font size
  // (pdf.js's 1 / --min-font-size) shrank every vertical inset nine to
  // twelve times, and each frame fell back onto the span's ascent box.
  const emX = fontPx * screenScale * scale.x;
  const emY = fontPx * screenScale * scale.y;
  const inset = (value: number) => `${(Math.round(value * 1000) / 1000).toString()}em`;
  const frame = [
    inset((target.top - spanRect.top) / emY),
    inset((spanRect.right - target.right) / emX),
    inset((spanRect.bottom - target.bottom) / emY),
    inset((target.left - spanRect.left) / emX),
  ].join(" ");
  return () => {
    span.style.setProperty(PDF_NATIVE_TEXT_EDIT_FRAME_PROPERTY, frame);
    // Where the frame is, for the press and the pointer to find the box by
    // it (pdfNativeTextEditBoxAtPoint).
    span.setAttribute(PDF_NATIVE_TEXT_EDIT_FRAME_RECT_ATTR, [rect.x, rect.y, rect.width, rect.height].join(","));
  };
}










export function orderPdfTextLayerEditedBoxes(
  layer: HTMLElement,
  boxes: readonly Readonly<{ x?: number; y?: number; width?: number; height?: number }>[],
): number {
  const rotation = Number(layer.dataset.mainRotation ?? 0);
  if (rotation !== 0 || boxes.length === 0) return 0;
  const spans = Array.from(
    layer.querySelectorAll<HTMLElement>(`span[${PDF_NATIVE_TEXT_ITEM_INDEX_ATTR}]`),
  ).filter((span) => !span.hasAttribute(PDF_NATIVE_TEXT_PARAGRAPH_ID_ATTR) && span.parentElement === layer);
  if (spans.length < 2) return 0;
  const frame = layer.getBoundingClientRect();
  if (!(frame.width > 0 && frame.height > 0)) return 0;
  const rects = new Map(spans.map((span) => [span, span.getBoundingClientRect()] as const));
  let moved = 0;
  for (const box of boxes) {
    if (![box.x, box.y, box.width, box.height].every((value) => typeof value === "number" && Number.isFinite(value))) continue;
    const left = frame.left + box.x! * frame.width;
    const top = frame.top + box.y! * frame.height;
    const right = left + box.width! * frame.width;
    const bottom = top + box.height! * frame.height;
    if (right <= left || bottom <= top) continue;
    const inside = spans.filter((span) => {
      const rect = rects.get(span)!;
      if (!(rect.width > 0 || rect.height > 0)) return false;
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      return cx >= left - 1 && cx <= right + 1 && cy >= top - 1 && cy <= bottom + 1;
    });
    if (inside.length === 0 || inside.length === spans.length) continue;
    const group = new Set(inside);
    const anchor = spans.find((span) => {
      if (group.has(span)) return false;
      const rect = rects.get(span)!;
      return rect.top >= bottom - rect.height * 0.5 && rect.left < right && rect.right > left;
    });
    if (!anchor) continue;
    // Already there: the group stands right before its anchor (pdf.js's own
    // <br> between two lines aside).
    let cursor: Element | null = anchor.previousElementSibling;
    let inPlace = true;
    for (let index = inside.length - 1; index >= 0; index -= 1) {
      while (cursor && cursor.tagName === "BR") cursor = cursor.previousElementSibling;
      if (cursor !== inside[index]) {
        inPlace = false;
        break;
      }
      cursor = cursor.previousElementSibling;
    }
    if (inPlace) continue;
    for (const span of inside) {
      layer.insertBefore(span, anchor);
      moved += 1;
    }
  }
  return moved;
}
