/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Where a stroke of ink is drawn on its sheet, from its attributes and the
 * sheet alone.
 *
 * A stroke at rest is drawn in its sheet's layer, not by a node view of its
 * own (inkSheetLayer): nothing of it is laid out, so its place cannot be read
 * off the page. It is worked out the way the float pass places the stroke's
 * own box: its stage at the point its anchor's zero offsets resolve to on the
 * page (`overlayStagePosition`: `placeFloatOnPage` with the layout anchor),
 * and its canvas inside the stage at its own offsets (`render`: the margins
 * are `xEmu`/`yEmu`, the canvas at least a stroke thick and centred on a zero
 * axis). Every number is in the sheet's own pixels, from its top-left corner,
 * so a sheet moving down the page moves its strokes with it and the zoom
 * scales them as it scales the sheet.
 *
 * A stroke this cannot place exactly (an axis aligned or at a relative
 * position, an origin other than the column and the paragraph) gets null:
 * its own node view draws it, as every stroke was drawn before.
 */
import { ptToPx } from "../../../../../lib/office-units";
import { documentShapeEmuToPx, type DocumentShapeAttrs } from "../../../../../lib/document-shapes";
import { placeFloatOnPage, type FloatPageGeometry } from "../../../../../lib/office-float-anchor";
import { documentShapeFloatLayoutAnchor, documentShapeFloatMode } from "../floatingTextBoxLayout";

/** A stroke's drawing on its sheet, in the sheet's own pixels. */
export interface InkStrokeBox {
  /** The canvas's top-left corner on the sheet. */
  readonly left: number;
  readonly top: number;
  /** The canvas: the stroke's box, at least a stroke thick on each axis. */
  readonly width: number;
  readonly height: number;
  /** Degrees, about the canvas's centre (the node view turns `paint`). */
  readonly rotation: number;
  readonly flipH: boolean;
  readonly flipV: boolean;
}

/** The canvas the node view gives a shape (`sizeCanvas`): its box, at least a
 * stroke thick, and where it starts against its offsets (centred on a zero
 * axis). */
export function inkStrokeCanvas(attrs: Pick<DocumentShapeAttrs, "xEmu" | "yEmu" | "widthEmu" | "heightEmu" | "outlineWidthPt">): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  const width = documentShapeEmuToPx(attrs.widthEmu);
  const height = documentShapeEmuToPx(attrs.heightEmu);
  const strokePx = Math.max(1, ptToPx(attrs.outlineWidthPt));
  const canvasWidth = Math.max(width, strokePx);
  const canvasHeight = Math.max(height, strokePx);
  return {
    x: documentShapeEmuToPx(attrs.xEmu) - (canvasWidth - width) / 2,
    y: documentShapeEmuToPx(attrs.yEmu) - (canvasHeight - height) / 2,
    width: canvasWidth,
    height: canvasHeight,
  };
}

/**
 * Whether a stroke's place is one this module works out exactly: drawn over
 * the text (an overlay), from its column and its paragraph, at plain offsets.
 * `floatAnchor` is the node's own attribute, `attrs` its normalized attrs.
 */
export function inkStrokePlacedFromData(floatAnchor: unknown, attrs: DocumentShapeAttrs): boolean {
  if (documentShapeFloatMode(attrs.wrapMode, floatAnchor) !== "overlay") return false;
  const anchor = documentShapeFloatLayoutAnchor(floatAnchor, attrs);
  if (!anchor || anchor.simplePos || anchor.groupTransform) return false;
  const plain = (axis: { relativeFrom: string; align?: string; percentOffset?: number }) =>
    !axis.align && typeof axis.percentOffset !== "number";
  return (
    anchor.horizontal.relativeFrom === "column" &&
    anchor.vertical.relativeFrom === "paragraph" &&
    plain(anchor.horizontal) &&
    plain(anchor.vertical)
  );
}

/**
 * The stroke's drawing on its sheet: `geometry` is the sheet's (the float
 * pass's `sheetGeometry`, keep-on-page facts included) and `flowTopPx` the
 * top of the place in the flow it is anchored at (`inkStrokeFlowTopPx`).
 * Null when its place is not one this works out (`inkStrokePlacedFromData`).
 */
export function inkStrokeBoxOnSheet(
  floatAnchor: unknown,
  attrs: DocumentShapeAttrs,
  geometry: FloatPageGeometry,
  flowTopPx: number,
): InkStrokeBox | null {
  if (!inkStrokePlacedFromData(floatAnchor, attrs)) return null;
  const anchor = documentShapeFloatLayoutAnchor(floatAnchor, attrs);
  if (!anchor) return null;
  const stage = placeFloatOnPage(anchor, { ...geometry, flowTopPx });
  const canvas = inkStrokeCanvas(attrs);
  if (![stage.leftPx, stage.topPx, canvas.x, canvas.y, canvas.width, canvas.height].every(Number.isFinite)) return null;
  return {
    left: stage.leftPx + canvas.x,
    top: stage.topPx + canvas.y,
    width: canvas.width,
    height: canvas.height,
    rotation: Number(attrs.rotation) || 0,
    flipH: attrs.flipH === true,
    flipV: attrs.flipV === true,
  };
}

/** Whether `element` is a stroke of ink out of the flow (a node view's box,
 * or the empty element of one drawn in its sheet's layer): it takes no room,
 * and the place in the flow of a stroke after it is under the block before it. */
export function outOfFlowStrokeElement(element: Element): boolean {
  return (
    element.tagName === "FIGURE" &&
    element.getAttribute("data-float-mode") === "overlay" &&
    element.hasAttribute("data-ink-tool")
  );
}

/**
 * The top of the place in the flow a stroke standing at `element` (a child of its
 * sheet) is anchored at, in the sheet's pixels: under the in-flow block
 * before it, after that block's space after; the sheet's content top when
 * none is before it -- the float pass's `inFlowTopOf`. A handwritten page's
 * strokes all stand before its first paragraph, and their place is the
 * sheet's own padding: nothing of the sheet's content is read, so a sheet
 * asleep (sheetDormancy) is not woken for it.
 *
 * `read` gives the sheet's content top, and the bottom of a block in the flow
 * with its space after (null for one out of the flow), both in the sheet's
 * pixels; the caller shares its reads among the strokes of a sheet.
 */
export function inkStrokeFlowTopPx(
  element: Element,
  read: {
    readonly contentTopPx: () => number;
    readonly blockBottomPx: (block: HTMLElement) => number | null;
  },
): number {
  for (let previous = element.previousElementSibling; previous; previous = previous.previousElementSibling) {
    if (!(previous instanceof HTMLElement) || outOfFlowStrokeElement(previous)) continue;
    if (previous.hasAttribute("data-ink-sheet-layer")) continue;
    const bottom = read.blockBottomPx(previous);
    if (bottom !== null) return bottom;
  }
  return read.contentTopPx();
}
