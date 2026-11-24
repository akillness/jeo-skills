/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  applyResizeThroughZero,
  applyResizeWithModifiers,
  type BlockGeometry,
  type ResizeHandle,
} from "../../../../lib/presentation-drag";

export type DocumentObjectGeometry = BlockGeometry & { rotation?: number };

export interface DocumentObjectResizeOptions {
  scaleX: number;
  scaleY: number;
  emuPerPx: number;
  min: number;
  max: number;
  lockAspect: boolean;
  /** Ctrl (Option on a Mac) held: resize about the centre, as Word does. */
  fromCenter?: boolean;
}

/** A document object's resize that may have carried a handle through the pinned edge. */
export interface DocumentObjectResizeThroughZero {
  geom: BlockGeometry;
  /** The drag crossed the pinned vertical edge: the object is mirrored on x. */
  flipX: boolean;
  /** The drag crossed the pinned horizontal edge: the object is mirrored on y. */
  flipY: boolean;
}

function resizeDocumentObjectWith(
  base: DocumentObjectGeometry,
  handle: ResizeHandle,
  screenDx: number,
  screenDy: number,
  options: DocumentObjectResizeOptions,
  throughZero: boolean,
): DocumentObjectResizeThroughZero {
  const radians = (base.rotation ?? 0) * Math.PI / 180;
  const cosine = Math.cos(radians), sine = Math.sin(radians);
  const dx = screenDx / (options.scaleX || 1) * options.emuPerPx;
  const dy = screenDy / (options.scaleY || 1) * options.emuPerPx;
  // Give each edge the same maximum extent without imposing a slide's origin
  // on a Word drawing (negative document offsets are valid).
  const local = { ...base, left: options.max - base.width, top: options.max - base.height };
  const bounds = { width: 2 * options.max - base.width, height: 2 * options.max - base.height };
  const localDx = dx * cosine + dy * sine;
  const localDy = dy * cosine - dx * sine;
  const through = throughZero
    ? applyResizeThroughZero(local, handle, localDx, localDy, bounds, { lockAspect: options.lockAspect, fromCenter: options.fromCenter === true }, options.min)
    : {
        geom: applyResizeWithModifiers(local, handle, localDx, localDy, bounds, { lockAspect: options.lockAspect, fromCenter: options.fromCenter === true }, options.min),
        flipX: false,
        flipY: false,
      };
  const next = through.geom;
  const cx = next.left - local.left + (next.width - base.width) / 2;
  const cy = next.top - local.top + (next.height - base.height) / 2;
  return {
    geom: {
      left: Math.round(base.left + cx * cosine - cy * sine - (next.width - base.width) / 2),
      top: Math.round(base.top + cx * sine + cy * cosine - (next.height - base.height) / 2),
      width: next.width,
      height: next.height,
    },
    flipX: through.flipX,
    flipY: through.flipY,
  };
}

/** PPT's eight-handle geometry, adapted to Docs flow offsets instead of slide bounds. */
export function resizeDocumentObject(
  base: DocumentObjectGeometry,
  handle: ResizeHandle,
  screenDx: number,
  screenDy: number,
  options: DocumentObjectResizeOptions,
): BlockGeometry {
  return resizeDocumentObjectWith(base, handle, screenDx, screenDy, options, false).geom;
}

/**
 * The same, carried through the pinned edge: Word mirrors a shape (its
 * geometry, never its words) when a handle is dragged past the opposite side
 * in the same gesture, the pinned edge staying put. The crossed axis is
 * reported for the caller to compose with the shape's own `flipH` / `flipV`.
 * A chart keeps {@link resizeDocumentObject}: Word does not flip one.
 */
export function resizeDocumentObjectThroughZero(
  base: DocumentObjectGeometry,
  handle: ResizeHandle,
  screenDx: number,
  screenDy: number,
  options: DocumentObjectResizeOptions,
): DocumentObjectResizeThroughZero {
  return resizeDocumentObjectWith(base, handle, screenDx, screenDy, options, true);
}

/** Layout dimensions exclude rotation, unlike an object's own bounding rect. */
export function documentViewScale(element: HTMLElement): { scaleX: number; scaleY: number } {
  const bounds = element.getBoundingClientRect();
  return {
    scaleX: element.offsetWidth > 0 ? bounds.width / element.offsetWidth : 1,
    scaleY: element.offsetHeight > 0 ? bounds.height / element.offsetHeight : 1,
  };
}
