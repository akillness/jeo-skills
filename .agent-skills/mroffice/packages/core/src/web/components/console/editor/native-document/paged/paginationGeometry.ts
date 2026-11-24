/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pagination always measures in document CSS pixels, never canvas pixels.
 * Window/document zoom transforms client rects but leaves offsets, padding,
 * line pitch and paper capacity unchanged. Normalize at the DOM boundary so
 * every splitter and its merge threshold use the same physical units.
 */
export interface PaginationScale {
  x: number;
  y: number;
}

// The scale each sheet was read at during the running layout pass.
let passScales: Map<HTMLElement, PaginationScale> | null = null;

/**
 * Run a synchronous layout pass reading each page sheet's scale once. The
 * zoom cannot change inside one pass, but every block it measures asked for
 * its sheet's box and computed style again (a hundred-page pass spent about
 * a tenth of its time there).
 */
export function withPaginationScaleReuse<T>(pass: () => T): T {
  if (passScales) return pass();
  passScales = new Map();
  try {
    return pass();
  } finally {
    passScales = null;
  }
}

export function paginationLayoutScale(element: HTMLElement): PaginationScale {
  // The fixed paper box remains measurable even when its contents overflow.
  // Never infer scale from scrollHeight or a multi-column fragment union.
  const host =
    element.closest<HTMLElement>("article[data-page-sheet]") ?? element;
  const reused = passScales?.get(host);
  if (reused) return reused;
  const scale = readPaginationLayoutScale(host);
  passScales?.set(host, scale);
  return scale;
}

function readPaginationLayoutScale(host: HTMLElement): PaginationScale {
  const rect = host.getBoundingClientRect();
  const style = getComputedStyle(host);
  const layoutSize = (axis: "width" | "height", fallback: number) => {
    const value = style[axis];
    const used = value.endsWith("px") ? Number.parseFloat(value) : NaN;
    if (!(used > 0)) return fallback;
    if (style.boxSizing === "border-box") return used;
    const sides = axis === "width" ? ["Left", "Right"] : ["Top", "Bottom"];
    return sides.reduce(
      (size, side) =>
        size +
        (Number.parseFloat(
          style.getPropertyValue(`padding-${side.toLowerCase()}`),
        ) || 0) +
        (Number.parseFloat(
          style.getPropertyValue(`border-${side.toLowerCase()}-width`),
        ) || 0),
      used,
    );
  };
  const ratio = (visual: number, layout: number) =>
    visual > 0 && layout > 0 && Number.isFinite(visual / layout)
      ? visual / layout
      : 1;
  return {
    // offsetHeight/Width round to integers. Prefer the resolved border box so
    // fractional Word paper sizes do not manufacture a scale at 100% zoom.
    x: ratio(
      rect.width,
      layoutSize("width", host.offsetWidth || host.clientWidth),
    ),
    y: ratio(rect.height, layoutSize("height", host.offsetHeight)),
  };
}

export function clientRectInPaginationLayout(
  rect: Pick<
    DOMRectReadOnly,
    "top" | "bottom" | "left" | "right" | "width" | "height"
  >,
  scale: PaginationScale,
) {
  return {
    top: rect.top / scale.y,
    bottom: rect.bottom / scale.y,
    left: rect.left / scale.x,
    right: rect.right / scale.x,
    width: rect.width / scale.x,
    height: rect.height / scale.y,
  };
}

export function paginationLayoutRect(
  element: HTMLElement,
  scale = paginationLayoutScale(element),
) {
  return clientRectInPaginationLayout(element.getBoundingClientRect(), scale);
}


/** Use actual ancestor transforms for overlays. Computed paper widths are
 * rounded strings, and dividing by them accumulates drift down a long book. */
export function paginationTransformScale(container: HTMLElement): PaginationScale | null {
  if (typeof DOMMatrixReadOnly === "undefined") return null;
  let x = 1, y = 1;
  for (let element: HTMLElement | null = container; element; element = element.parentElement) {
    const css = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(css.transform === "none" ? undefined : css.transform);
    if (!matrix.is2D || matrix.b !== 0 || matrix.c !== 0 || matrix.a <= 0 || matrix.d <= 0) return null;
    const scale = css.scale && css.scale !== "none" ? css.scale.split(/\s+/).map(Number) : [1];
    const zoom = css.zoom && css.zoom !== "normal" ? Number.parseFloat(css.zoom) / (css.zoom.endsWith("%") ? 100 : 1) : 1;
    const sx = scale[0], sy = scale[1] ?? sx;
    if (![sx, sy, zoom].every(value => Number.isFinite(value) && value > 0)) return null;
    x *= matrix.a * sx * zoom;
    y *= matrix.d * sy * zoom;
  }
  return {x, y};
}

/** Overlay coordinates share the paper's unscaled, fractional CSS geometry. */
export function paginationBoxRelativeTo(element: HTMLElement, container: HTMLElement, exactScale?: PaginationScale | null) {
  const scale = exactScale ?? paginationLayoutScale(element);
  const paper = element.getBoundingClientRect();
  const host = container.getBoundingClientRect();
  // Chromium/WebKit layout uses 1/64 CSS-pixel units. Inverse-transforming
  // float client rectangles can land just below a unit and CSS assignment
  // truncates to the previous one. Recover the layout unit before writing
  // the overlay; this never changes paper sizing or pagination capacity.
  const layoutUnit = (value: number) => Math.round(value * 64) / 64;
  return {
    top: layoutUnit((paper.top - host.top) / scale.y - container.clientTop + container.scrollTop),
    left: layoutUnit((paper.left - host.left) / scale.x - container.clientLeft + container.scrollLeft),
    width: layoutUnit(paper.width / scale.x),
    height: layoutUnit(paper.height / scale.y),
  };
}

/** Where an element's border box starts in the page's layout, CSS pixels. */
function layoutOrigin(element: HTMLElement): { top: number; left: number } {
  let top = 0,
    left = 0;
  for (let node: HTMLElement | null = element; node; ) {
    const parent = node.offsetParent as HTMLElement | null;
    top += node.offsetTop + (parent?.clientTop ?? 0);
    left += node.offsetLeft + (parent?.clientLeft ?? 0);
    node = parent;
  }
  return { top, left };
}

/** The used border-box size, fractional (an A4 sheet is 793.7px) where the
 * element is sized border-box, within a pixel of its rounded offset size. */
function layoutSize(element: HTMLElement, axis: "width" | "height"): number {
  const rounded = axis === "width" ? element.offsetWidth : element.offsetHeight;
  const style = getComputedStyle(element);
  const used = Number.parseFloat(style[axis]);
  return style.boxSizing === "border-box" && Math.abs(used - rounded) < 1 ? used : rounded;
}

/** An element's box in a container's own CSS pixels, from layout offsets:
 * no transform or zoom between them or above them changes it, a 3D turn
 * included, which no scale read from client rects can undo. Its place rounds
 * to whole pixels. */
export function layoutBoxRelativeTo(element: HTMLElement, container: HTMLElement) {
  const at = layoutOrigin(element);
  const from = layoutOrigin(container);
  return {
    top: at.top - from.top,
    left: at.left - from.left,
    width: layoutSize(element, "width"),
    height: layoutSize(element, "height"),
  };
}
