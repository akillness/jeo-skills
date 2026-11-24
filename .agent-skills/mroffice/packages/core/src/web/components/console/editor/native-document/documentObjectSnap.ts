/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's alignment guides for the page's floating objects, through the
 * shared object snapping (lib/office-object-snap): a picture, chart, shape
 * or text box dragged, sized or drawn on a page lines up with the page's
 * other floating objects and with the page's edges, centre and margins
 * (Microsoft Support: alignment guides "help line up charts, photos and
 * diagrams" with the page and its margins; Alt -- Command on a Mac --
 * overrides the snap while dragging). Everything is in page CSS px, the
 * float pass's own measure (`floatPaintOf`); the guides are drawn over the
 * page.
 */

import {
  objectSnapSuspended,
  objectSnapThreshold,
  officeShapeSnapsRound,
  paintObjectSnapGuides,
  snapObjectMove,
  snapObjectPoint,
  snapObjectResize,
  type ObjectSnapGuides,
  type ObjectSnapRect,
  type ObjectSnapScene,
} from "../../../../lib/office-object-snap";

import { floatedObjectsOn, floatPaintOf, floatSheetGeometry } from "./floatingTextBoxLayout";

const PAGE_SELECTOR = "article[data-page-sheet]";

type Modifiers = { readonly altKey?: boolean; readonly metaKey?: boolean };

/** One gesture's snapping on a page. Deltas are page px. */
export interface DocumentObjectSnap {
  /** The move's snapped offset; `lock` is the axis Shift holds it on. */
  move(dx: number, dy: number, event: Modifiers, lock?: "horizontal" | "vertical" | null): { dx: number; dy: number };
  /**
   * A resize's snapped pointer offset: `evaluate` answers the box (page px)
   * the caller's resize makes for a pointer offset, in the caller's own
   * pointer units.
   */
  resize(
    evaluate: (dx: number, dy: number) => ObjectSnapRect | null,
    dx: number,
    dy: number,
    handle: string,
    event: Modifiers,
    options?: { readonly lockAspect?: boolean; readonly centered?: boolean },
  ): { dx: number; dy: number };
  /** Take the guides away (pointer up, cancel). */
  end(): void;
}

const boxOf = (element: HTMLElement, paint: { leftPx: number; topPx: number; widthPx: number; heightPx: number }): ObjectSnapRect => ({
  left: paint.leftPx,
  top: paint.topPx,
  width: paint.widthPx,
  height: paint.heightPx,
  round: officeShapeSnapsRound(element.dataset.preset),
});

/** The page `sheet`'s scene: its floating objects other than `moving`
 * (never ink), and the page and its margin box as frames. */
function pageScene(sheet: HTMLElement, moving: readonly HTMLElement[]): ObjectSnapScene | null {
  const geometry = floatSheetGeometry(sheet);
  if (!geometry) return null;
  const others = floatedObjectsOn(sheet)
    .filter(({ element }) =>
      !element.hasAttribute("data-ink-tool") &&
      !moving.some((item) => item === element || item.contains(element) || element.contains(item)),
    )
    .map(({ element, paint }) => boxOf(element, paint));
  const page = { left: 0, top: 0, width: geometry.pageWidthPx, height: geometry.pageHeightPx };
  const margins = {
    left: geometry.marginLeftPx,
    top: geometry.marginTopPx,
    width: Math.max(0, geometry.pageWidthPx - geometry.marginLeftPx - geometry.marginRightPx),
    height: Math.max(0, geometry.pageHeightPx - geometry.marginTopPx - geometry.marginBottomPx),
  };
  const scale = pageScale(sheet);
  return { others, frames: [page, margins], threshold: objectSnapThreshold(1 / scale.x) };
}

/** Client px per page px (the editor's zoom, any transform included). */
function pageScale(sheet: HTMLElement): { x: number; y: number } {
  const rect = sheet.getBoundingClientRect();
  return {
    x: sheet.offsetWidth > 0 && rect.width > 0 ? rect.width / sheet.offsetWidth : 1,
    y: sheet.offsetHeight > 0 && rect.height > 0 ? rect.height / sheet.offsetHeight : 1,
  };
}

function paintOnPage(sheet: HTMLElement, guides: ObjectSnapGuides | null): void {
  if (!guides) {
    paintObjectSnapGuides(sheet.ownerDocument, null);
    return;
  }
  const rect = sheet.getBoundingClientRect();
  const scale = pageScale(sheet);
  paintObjectSnapGuides(
    sheet.ownerDocument,
    guides,
    (x, y) => ({ x: rect.left + x * scale.x, y: rect.top + y * scale.y }),
    sheet,
  );
}

/**
 * Begin snapping a gesture of the floating objects `moving` (the elements
 * the float pass placed: a picture's wrapper, a shape's figure, a text box's
 * wrapper). Null when they are not floated on a page (in line, in a table
 * cell of no page): the gesture then goes unsnapped.
 */
export function beginDocumentObjectSnap(moving: readonly HTMLElement[]): DocumentObjectSnap | null {
  const sheet = moving[0]?.closest<HTMLElement>(PAGE_SELECTOR);
  if (!sheet) return null;
  const boxes = moving.flatMap((element) => {
    const paint = floatPaintOf(element);
    return paint && paint.widthPx > 0 && paint.heightPx > 0 ? [boxOf(element, paint)] : [];
  });
  if (boxes.length === 0) return null;
  const scene = pageScene(sheet, moving);
  if (!scene) return null;
  return {
    move(dx, dy, event, lock = null) {
      if (objectSnapSuspended(event)) {
        paintOnPage(sheet, null);
        return { dx, dy };
      }
      const snapped = snapObjectMove(boxes, dx, dy, scene, { lock });
      paintOnPage(sheet, snapped.guides);
      return { dx: snapped.dx, dy: snapped.dy };
    },
    resize(evaluate, dx, dy, handle, event, options = {}) {
      if (objectSnapSuspended(event)) {
        paintOnPage(sheet, null);
        return { dx, dy };
      }
      const snapped = snapObjectResize({ evaluate, dx, dy, handle, scene, ...options });
      paintOnPage(sheet, snapped.guides);
      return { dx: snapped.dx, dy: snapped.dy };
    },
    end() {
      paintOnPage(sheet, null);
    },
  };
}

/** Take any alignment guides away (a gesture cancelled). */
export function clearDocumentObjectSnapGuides(doc: Document): void {
  paintObjectSnapGuides(doc, null);
}

/**
 * Snap a point in client px (a new shape's press or far corner, drawn over
 * the pages) to the page under it; null to take the guides away.
 */
export function snapDocumentClientPoint(
  root: HTMLElement,
  point: { x: number; y: number } | null,
  event: Modifiers | null,
): { x: number; y: number } | null {
  if (!point || !event || objectSnapSuspended(event)) {
    paintObjectSnapGuides(root.ownerDocument, null);
    return point;
  }
  const sheet = Array.from(root.querySelectorAll<HTMLElement>(PAGE_SELECTOR)).find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  });
  const scene = sheet ? pageScene(sheet, []) : null;
  if (!sheet || !scene) {
    paintObjectSnapGuides(root.ownerDocument, null);
    return point;
  }
  const rect = sheet.getBoundingClientRect();
  const scale = pageScale(sheet);
  const snapped = snapObjectPoint({ x: (point.x - rect.left) / scale.x, y: (point.y - rect.top) / scale.y }, scene);
  paintOnPage(sheet, snapped.guides);
  return { x: rect.left + snapped.x * scale.x, y: rect.top + snapped.y * scale.y };
}
