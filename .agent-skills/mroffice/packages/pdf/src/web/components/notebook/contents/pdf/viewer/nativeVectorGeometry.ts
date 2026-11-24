/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  PdfNativeVectorSelectionRoute,
} from "../../../../../lib/pdf/semantic-appearance-inspection";
import type {
  PdfVectorPageGeometry,
} from "../../../../../lib/pdf/vector-capability-reconciliation";
import type { PdfVectorContentItem } from "../../../../../lib/pdf/vector-content-inventory";
import type { ShapeLineStyle } from "@mrnote/core/web/lib/pdf/shapes.ts";
import type { PdfRotation } from "@mrnote/core/web/lib/pdf/page-ops.ts";
import { displayUnitAffineToPdfUserSpace, pdfNativeVectorDisplayBoxAffine } from "../../../../../lib/pdf/native-vector-commands";
import type { PdfNativeVectorAffineTransform } from "../../../../../lib/pdf/engine/native/vector-content-transaction";
import type { PdfPage } from "./pdfApi";

/**
 * How far (page fractions, per axis) a subpath's last segment may end from
 * its start and still close on it -- the drawing-side reading of the
 * writer's PDF_NATIVE_VECTOR_CLOSING_VERTEX_TOLERANCE (0.001 pt).
 */
const CLOSING_VERTEX_TOLERANCE = 0.000_001;

/**
 * The anchors a vertex handle can take hold of, in page fractions, from the
 * renderer's own drawing of the routed object: a line's two ends; a
 * rectangle's four corners, an ellipse's four quadrant points and a
 * subpath's move/line points and curve ends, in drawing order, with a
 * subpath that comes back to its own start closing on one vertex there
 * (mirror of pdfNativeVectorVertexCommands over the source; the writer
 * re-proves each handle).
 */
export function nativeVectorDisplayAnchors(
  route: PdfNativeVectorSelectionRoute,
  items: readonly PdfVectorContentItem[] | undefined,
): readonly Readonly<{ x: number; y: number }>[] | null {
  const item = items?.find(
    (entry) => entry.operatorIndex === route.rendererOperatorIndex,
  );
  if (!item) return null;
  if (route.proofFamily === "shape" && route.nativeKind === "line") {
    if (!item.simpleLineEndpoints) return null;
    return [item.simpleLineEndpoints.start, item.simpleLineEndpoints.end];
  }
  const commands = item.simpleSubpath?.commands;
  if (!commands) return null;
  const anchors: Readonly<{ x: number; y: number }>[] = [];
  let open: Readonly<{ x: number; y: number }> | null = null;
  let segments = 0;
  const finish = () => {
    const last = anchors.at(-1);
    if (
      open &&
      segments >= 2 &&
      last &&
      Math.abs(last.x - open.x) <= CLOSING_VERTEX_TOLERANCE &&
      Math.abs(last.y - open.y) <= CLOSING_VERTEX_TOLERANCE
    ) {
      anchors.pop();
    }
    open = null;
    segments = 0;
  };
  for (const command of commands) {
    if (command.kind === "quadraticCurveTo") return null;
    if (command.kind === "closePath") {
      finish();
      continue;
    }
    if (command.kind === "moveTo") {
      finish();
      anchors.push(command.point);
      open = command.point;
      continue;
    }
    anchors.push(command.kind === "curveTo" ? command.end : command.point);
    segments += 1;
  }
  finish();
  return anchors;
}

/**
 * Whether Edit Points can take hold of the routed object: every kind of
 * path object can -- a rectangle or an ellipse is turned into the freeform
 * it draws by its first point move, as in PowerPoint and WPS.
 */
export function nativeVectorHasEditablePoints(
  route: Pick<PdfNativeVectorSelectionRoute, "nativeKind"> | null | undefined,
): boolean {
  return (
    route?.nativeKind === "line" ||
    route?.nativeKind === "rectangle" ||
    route?.nativeKind === "ellipse" ||
    route?.nativeKind === "subpath"
  );
}

/**
 * The object vertex editing follows across its own saves: an Edit Points
 * write turns a rectangle or an ellipse into a subpath (or a quad back into
 * a rectangle) at the same place in the page's drawing, which is still the
 * object being edited.
 */
export function nativeVectorVertexTargetKey(
  route: Pick<PdfNativeVectorSelectionRoute, "pageNumber" | "rendererOperatorIndex" | "nativeKind"> | null,
): string | null {
  if (!route) return null;
  const kind = route.nativeKind === "line" ? "line" : "path";
  return `${route.pageNumber}:${route.rendererOperatorIndex}:${kind}`;
}

export function sameNativeVectorSelectionRoute(
  left: PdfNativeVectorSelectionRoute,
  right: PdfNativeVectorSelectionRoute,
): boolean {
  return (
    left.selectionOnly === true &&
    right.selectionOnly === true &&
    left.sourceSha256 === right.sourceSha256 &&
    left.pageNumber === right.pageNumber &&
    left.rendererOperatorIndex === right.rendererOperatorIndex &&
    left.proofFamily === right.proofFamily &&
    left.nativeKind === right.nativeKind &&
    left.paintMode === right.paintMode &&
    left.proofId === right.proofId &&
    left.proofDigest === right.proofDigest &&
    left.contentStreamObjectNumber === right.contentStreamObjectNumber &&
    left.contentStreamGeneration === right.contentStreamGeneration &&
    left.operatorStart === right.operatorStart &&
    left.operatorEnd === right.operatorEnd &&
    left.style?.proofId === right.style?.proofId &&
    left.style?.proofDigest === right.style?.proofDigest &&
    left.style?.pageProofIndex === right.style?.pageProofIndex &&
    JSON.stringify(left.style?.style ?? null) ===
      JSON.stringify(right.style?.style ?? null) &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height
  );
}

/**
 * The same drawn object in another revision of its page: a route proves an
 * object in exact bytes, so after any write (a paste among them) the copied
 * route names nothing; the object that still draws the same kind of path, in
 * the same paint and style, on the same box is the one the copy was made of.
 */
export function sameNativeVectorDrawing(
  left: PdfNativeVectorSelectionRoute,
  right: PdfNativeVectorSelectionRoute,
): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
  return (
    left.pageNumber === right.pageNumber &&
    left.proofFamily === right.proofFamily &&
    left.nativeKind === right.nativeKind &&
    left.paintMode === right.paintMode &&
    JSON.stringify(left.style?.style ?? null) ===
      JSON.stringify(right.style?.style ?? null) &&
    near(left.bounds.x, right.bounds.x) &&
    near(left.bounds.y, right.bounds.y) &&
    near(left.bounds.width, right.bounds.width) &&
    near(left.bounds.height, right.bounds.height)
  );
}

export function normalizedPdfSourceRotation(value: unknown): PdfRotation | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = ((Math.trunc(numeric) % 360) + 360) % 360;
  return normalized === 0 ||
    normalized === 90 ||
    normalized === 180 ||
    normalized === 270
    ? normalized
    : null;
}

export function nativeVectorPageGeometryFromProxy(
  proxy: ({ view?: unknown; rotate?: unknown } & PdfPage) | undefined,
  displayedRotation: number,
): PdfVectorPageGeometry | null {
  const rotation = normalizedPdfSourceRotation(proxy?.rotate);
  const view = Array.isArray(proxy?.view) ? proxy.view : null;
  return rotation !== null &&
    rotation === displayedRotation &&
    view &&
    view.length >= 4 &&
    view.slice(0, 4).every(Number.isFinite) &&
    Number(view[2]) > Number(view[0]) &&
    Number(view[3]) > Number(view[1])
    ? Object.freeze({
        cropBox: Object.freeze({
          xMin: Number(view[0]),
          yMin: Number(view[1]),
          xMax: Number(view[2]),
          yMax: Number(view[3]),
        }),
        rotation,
      })
    : null;
}

export function nativeVectorRgbToHex(
  value: Readonly<{ r: number; g: number; b: number }> | null,
): string | undefined {
  if (!value) return undefined;
  const component = (entry: number) =>
    Math.round(Math.min(1, Math.max(0, entry)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${component(value.r)}${component(value.g)}${component(value.b)}`;
}

export function nativeVectorHexToRgb(
  value: string,
): Readonly<{ r: number; g: number; b: number }> | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const numeric = Number.parseInt(match[1], 16);
  return Object.freeze({
    r: ((numeric >>> 16) & 0xff) / 255,
    g: ((numeric >>> 8) & 0xff) / 255,
    b: (numeric & 0xff) / 255,
  });
}

export function nativeVectorLineStyle(
  style: NonNullable<PdfNativeVectorSelectionRoute["style"]>["style"],
): ShapeLineStyle {
  if (!style.dashArray || style.dashArray.length === 0) return "solid";
  const width = Math.max(0.1, style.lineWidth ?? 1);
  return style.lineCap === "round" && style.dashArray[0] <= width * 1.5
    ? "dotted"
    : "dashed";
}

/**
 * Where a box (page fractions) lands once turned `degrees` clockwise about its
 * centre on a page `pageWidth` x `pageHeight` (any unit, same for both): the
 * box around its turned corners, which may reach past the page (WPS turns a
 * page-size background 30 degrees and its frame reads 926 x 992 on a 612 x
 * 792 page). The frame stands there while the turned object's routes are
 * proved.
 */
export function rotatedNativeVectorBounds(
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  degrees: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } | null {
  if (!(pageWidth > 0) || !(pageHeight > 0) || !Number.isFinite(degrees)) return null;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (bounds.x + bounds.width / 2) * pageWidth;
  const cy = (bounds.y + bounds.height / 2) * pageHeight;
  const halfWidth = (bounds.width * pageWidth) / 2;
  const halfHeight = (bounds.height * pageHeight) / 2;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [dx, dy] of [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]]) {
    xs.push(cx + dx * cos - dy * sin);
    ys.push(cy + dx * sin + dy * cos);
  }
  const left = Math.min(...xs) / pageWidth;
  const top = Math.min(...ys) / pageHeight;
  const right = Math.max(...xs) / pageWidth;
  const bottom = Math.max(...ys) / pageHeight;
  // A line turned upright has no width: still a place to stand on.
  if (right < left || bottom < top || right - left + (bottom - top) <= 0) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The box (page fractions) around a set of points. */
export function nativeVectorPointBounds(
  points: readonly Readonly<{ x: number; y: number }>[],
): { x: number; y: number; width: number; height: number } | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}



export function nativeVectorPagePoints(
  geometry: PdfVectorPageGeometry | null | undefined,
  userUnit = 1,
): { width: number; height: number } | null {
  if (!geometry) return null;
  const width = (geometry.cropBox.xMax - geometry.cropBox.xMin) * userUnit;
  const height = (geometry.cropBox.yMax - geometry.cropBox.yMin) * userUnit;
  return geometry.rotation % 180 === 0
    ? { width, height }
    : { width: height, height: width };
}

/**
 * How much of a shape stays on the page when a gesture takes it past the
 * edge (points): WPS stops a drag with a strip of the object still on the
 * page, the part the pointer takes it back by; a smaller object stays whole.
 */
export const NATIVE_VECTOR_PAGE_KEEP_POINTS = 24;

/** That strip as page percent on each axis of the page as shown. */
export function nativeVectorPageKeep(
  page: Readonly<{ width: number; height: number }> | null,
): { x: number; y: number } | undefined {
  if (!page || !(page.width > 0) || !(page.height > 0)) return undefined;
  return {
    x: (NATIVE_VECTOR_PAGE_KEEP_POINTS / page.width) * 100,
    y: (NATIVE_VECTOR_PAGE_KEEP_POINTS / page.height) * 100,
  };
}

/** Where a client point falls on a page element (`data-page-number`), as
 * fractions of the page as shown; null off a page or before it is laid out. */
export function nativeVectorPagePointOn(
  page: HTMLElement,
  clientX: number,
  clientY: number,
): { pageNumber: number; x: number; y: number } | null {
  const rect = page.getBoundingClientRect();
  const pageNumber = Number(page.dataset.pageNumber);
  if (!(rect.width > 0) || !(rect.height > 0) || !Number.isInteger(pageNumber) || pageNumber < 1) {
    return null;
  }
  return {
    pageNumber,
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

/** A page-fraction box, top-left origin. */
export type NativeVectorBox = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

// ---- Marquee (WPS 编辑内容: drag on an empty part of the page) -------------
// A drag that starts on nothing draws a box; every source shape the box
// touches is selected together under one group frame (wps/marquee-select.png).
// Text, objects and controls keep their own presses, and a finger scrolls.

/** How far (CSS px) a press on the page travels before it is a marquee. */
export const NATIVE_VECTOR_MARQUEE_THRESHOLD_PX = 4;

/** What a marquee may not start on: a control, an object with its own
 * press (annotations, shapes, frames, handles) or a line of page text. */
const NATIVE_VECTOR_MARQUEE_BLOCKERS = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "label",
  "[role='button']",
  "[role='link']",
  "[role='textbox']",
  "[role='slider']",
  "[role='checkbox']",
  "[role='menuitem']",
  "[contenteditable='true']",
  "[contenteditable='']",
  "[tabindex]",
  "[data-pdf-annotation-frame]",
  ".pdf-viewer__text-layer span",
  ".pdf-viewer__text-layer br",
].join(", ");

/** Whether a press on `target` inside `page` is on an empty part of it. */
export function nativeVectorMarqueeMayStart(
  target: EventTarget | null,
  page: Element,
): boolean {
  if (!(target instanceof Element) || !page.contains(target)) return false;
  const blocker = target.closest(NATIVE_VECTOR_MARQUEE_BLOCKERS);
  return blocker === null || blocker === page || !page.contains(blocker);
}

/** The marquee's box (page fractions) between two corners in page percent. */
export function nativeVectorMarqueeBox(
  start: Readonly<{ x: number; y: number }>,
  current: Readonly<{ x: number; y: number }>,
): NativeVectorBox {
  return {
    x: Math.min(start.x, current.x) / 100,
    y: Math.min(start.y, current.y) / 100,
    width: Math.abs(current.x - start.x) / 100,
    height: Math.abs(current.y - start.y) / 100,
  };
}

/** Every route whose frame the marquee touches, in the page's order. */
export function nativeVectorMarqueeTouched(
  routes: readonly PdfNativeVectorSelectionRoute[],
  box: NativeVectorBox,
  frameOf: (route: PdfNativeVectorSelectionRoute) => NativeVectorBox,
): PdfNativeVectorSelectionRoute[] {
  return routes.filter((route) => {
    const frame = frameOf(route);
    return (
      frame.x <= box.x + box.width &&
      box.x <= frame.x + frame.width &&
      frame.y <= box.y + box.height &&
      box.y <= frame.y + frame.height
    );
  });
}

/** The renderer's item a route was proved on, while the route still stands
 * on it: a stand-in route placed where a write left the object (see
 * PDFViewer's provisional route) carries a box of its own and no item. */
export function nativeVectorRouteItem(
  route: PdfNativeVectorSelectionRoute,
  items: readonly PdfVectorContentItem[] | undefined,
): PdfVectorContentItem | null {
  const item = items?.find(
    (entry) => entry.operatorIndex === route.rendererOperatorIndex,
  );
  if (!item) return null;
  const same = (left: number, right: number) => Math.abs(left - right) <= 1e-9;
  return same(item.x, route.bounds.x) &&
    same(item.y, route.bounds.y) &&
    same(item.width, route.bounds.width) &&
    same(item.height, route.bounds.height)
    ? item
    : null;
}

/** The stroke's width in points as the page paints it, or null for a fill
 * (or a route whose width nothing says). */
export function nativeVectorStrokePoints(
  route: PdfNativeVectorSelectionRoute,
  items: readonly PdfVectorContentItem[] | undefined,
): number | null {
  if (route.paintMode === "fill") return null;
  const painted = nativeVectorRouteItem(route, items)?.strokeWidth;
  if (typeof painted === "number" && Number.isFinite(painted)) return painted;
  const written = route.style?.style.lineWidth;
  return typeof written === "number" && Number.isFinite(written) ? written : null;
}

/**
 * Points of painted stroke per unit of the `w` the stream writes: a page
 * drawn under a scaling transform (a Skia print's `.24 0 0 -.24 cm`) paints
 * `5 w` as 1.2 pt. A thickness the user asks for in points is written as
 * that many points over this. 1 when either side is unknown.
 */
export function nativeVectorStrokeScale(
  route: PdfNativeVectorSelectionRoute,
  items: readonly PdfVectorContentItem[] | undefined,
): number {
  const painted = nativeVectorRouteItem(route, items)?.strokeWidth;
  const written = route.style?.style.lineWidth;
  return typeof painted === "number" &&
    typeof written === "number" &&
    painted > 0 &&
    written > 0
    ? painted / written
    : 1;
}

/**
 * The box a selected source vector's frame stands on and its size fields
 * read (page fractions): the whole path, past the page edge too where the
 * page cuts it, grown on every side by half its stroke -- as WPS measures a
 * shape (a 1.2 pt rule 462 pt long reads 463 x 1, a 3 pt diagonal whose path
 * is 124.7 x 119.1 reads 128 x 122). `page` is the page's displayed size in
 * points. A stand-in route keeps the box it was placed with.
 */
export function nativeVectorFrameBounds(
  route: PdfNativeVectorSelectionRoute,
  items: readonly PdfVectorContentItem[] | undefined,
  page: Readonly<{ width: number; height: number }> | null,
): NativeVectorBox {
  const item = nativeVectorRouteItem(route, items);
  if (!item || !page || !(page.width > 0) || !(page.height > 0)) return route.bounds;
  const extent = item.extent ?? route.bounds;
  // Per axis where the renderer says (a rule its thickness grip stretched
  // into a bar reaches tall, not wide), else half the width all round.
  const reach =
    route.paintMode !== "fill" && item.strokeReach ? item.strokeReach : null;
  const stroke = Math.max(0, nativeVectorStrokePoints(route, items) ?? 0);
  const halfX = reach ? Math.max(0, reach.x) : stroke / 2 / page.width;
  const halfY = reach ? Math.max(0, reach.y) : stroke / 2 / page.height;
  const box = {
    x: extent.x - halfX,
    y: extent.y - halfY,
    width: extent.width + 2 * halfX,
    height: extent.height + 2 * halfY,
  };
  return box.width > 0 && box.height > 0 ? box : route.bounds;
}

/**
 * Where a source vector takes the pointer (page fractions, on the page): its
 * path grown by the stroke it paints, so a rule its thickness grip turned
 * into a bar is picked up anywhere on the bar, as in WPS, not only on the
 * hairline at its middle.
 */
export function nativeVectorHitBounds(
  route: PdfNativeVectorSelectionRoute,
  items: readonly PdfVectorContentItem[] | undefined,
): NativeVectorBox {
  const reach =
    route.paintMode === "fill"
      ? undefined
      : nativeVectorRouteItem(route, items)?.strokeReach;
  if (!reach || !(reach.x > 0 || reach.y > 0)) return route.bounds;
  const { bounds } = route;
  const left = Math.max(0, bounds.x - reach.x);
  const top = Math.max(0, bounds.y - reach.y);
  const right = Math.min(1, bounds.x + bounds.width + reach.x);
  const bottom = Math.min(1, bounds.y + bounds.height + reach.y);
  return right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : bounds;
}

/** How far from a straight line's stroke a press still takes it, in page
 * heights (about 5 CSS px on a page drawn 800 px tall). */
const LINE_HIT_TOLERANCE = 0.006;











export function nativeVectorLineHitClipPath(
  route: PdfNativeVectorSelectionRoute,
  items: readonly PdfVectorContentItem[] | undefined,
  box: NativeVectorBox,
): string | null {
  if (route.paintMode !== "stroke") return null;
  const item = nativeVectorRouteItem(route, items);
  const ends = item?.simpleLineEndpoints;
  const reach = item?.strokeReach;
  if (!ends || !reach || !(reach.x > 0) || !(reach.y > 0) || !(box.width > 0) || !(box.height > 0)) return null;
  // Page width over page height: the same half width is reach.x of the
  // page's width and reach.y of its height.
  const aspect = reach.y / reach.x;
  if (!Number.isFinite(aspect) || aspect <= 0) return null;
  // In page heights on both axes, where a distance means the same along x and y.
  const ax = ends.start.x * aspect;
  const ay = ends.start.y;
  const bx = ends.end.x * aspect;
  const by = ends.end.y;
  const length = Math.hypot(bx - ax, by - ay);
  if (!(length > 0)) return null;
  const half = Math.max(reach.y, LINE_HIT_TOLERANCE);
  const ux = (bx - ax) / length;
  const uy = (by - ay) / length;
  const nx = -uy * half;
  const ny = ux * half;
  const ex = ux * half;
  const ey = uy * half;
  const corners = [
    [ax - ex + nx, ay - ey + ny],
    [bx + ex + nx, by + ey + ny],
    [bx + ex - nx, by + ey - ny],
    [ax - ex - nx, ay - ey - ny],
  ];
  const percent = (value: number) => `${Math.round(value * 10_000) / 100}%`;
  return `polygon(${corners
    .map(([x, y]) => `${percent((x / aspect - box.x) / box.width)} ${percent((y - box.y) / box.height)}`)
    .join(", ")})`;
}

/**
 * A resize of a stroked source vector as WPS makes one: the whole appearance
 * -- stroke, dash, corners -- carried from frame `from` onto `to` (page
 * fractions), written as one style `cm` (its 线宽 still reads what the stream
 * sets). Null where the box only moved, where the shape paints no stroke (its
 * outline scaling by its coordinates looks the same), or where no style was
 * proved for it (the outline then scales by its coordinates alone).
 */
export function nativeVectorResizeTransform(input: {
  readonly route: PdfNativeVectorSelectionRoute;
  readonly pageGeometry: PdfVectorPageGeometry;
  readonly from: NativeVectorBox;
  readonly to: NativeVectorBox;
  readonly mirror?: Readonly<{ x: boolean; y: boolean }> | null;
  /** The page's renderer inventory: a straight line's ends and stroke. */
  readonly items?: readonly PdfVectorContentItem[];
}): PdfNativeVectorAffineTransform | null {
  const { route, from, to } = input;
  if (!route.style || route.paintMode === "fill") return null;
  const same = (left: number, right: number) => Math.abs(left - right) <= 1e-9;
  if (
    same(from.width, to.width) &&
    same(from.height, to.height) &&
    !input.mirror?.x &&
    !input.mirror?.y
  ) {
    return null;
  }
  try {
    return nativeVectorLineThicknessTransform(input) ?? pdfNativeVectorDisplayBoxAffine(input);
  } catch {
    return null;
  }
}





















export function nativeVectorLineThicknessWidth(input: {
  readonly route: PdfNativeVectorSelectionRoute;
  readonly pageGeometry: PdfVectorPageGeometry;
  readonly from: NativeVectorBox;
  readonly to: NativeVectorBox;
  readonly mirror?: Readonly<{ x: boolean; y: boolean }> | null;
  readonly items?: readonly PdfVectorContentItem[];
}): { readonly scale: number; readonly shift: PdfNativeVectorAffineTransform | null } | null {
  try {
    const measured = lineThicknessChange(input);
    if (!measured) return null;
    const { scale, page, fromX, fromY, toX, toY } = measured;
    void page;
    // Its depth unchanged, the line was only moved (across itself, its ends
    // where they were along it): that is the geometry write's move, not a
    // line width. Taken here, every rule dragged up or down was written as
    
    if (Math.abs(scale - 1) <= 1e-6) return null;
    const moved = Math.abs(toX - fromX) > 1e-6 || Math.abs(toY - fromY) > 1e-6;
    return Object.freeze({
      scale,
      shift: moved
        ? displayUnitAffineToPdfUserSpace({
          pageGeometry: input.pageGeometry,
          matrix: { a: 1, b: 0, c: 0, d: 1, e: toX - fromX, f: toY - fromY },
        })
        : null,
    });
  } catch {
    return null;
  }
}











export function nativeVectorSkewedStrokeTurn(input: {
  readonly route: PdfNativeVectorSelectionRoute;
  readonly pageGeometry: PdfVectorPageGeometry;
  readonly from: NativeVectorBox;
  readonly degrees: number;
  readonly items?: readonly PdfVectorContentItem[];
}): PdfNativeVectorAffineTransform | null {
  const { route, items } = input;
  if (!route.style || route.paintMode === "fill" || !items) return null;
  const reach = nativeVectorRouteItem(route, items)?.strokeReach;
  const page = nativeVectorPagePoints(input.pageGeometry, 1);
  if (!reach || !page) return null;
  const along = reach.x * page.width;
  const across = reach.y * page.height;
  if (!(along > 0) || !(across > 0) || Math.abs(along / across - 1) <= 0.01) return null;
  const radians = (input.degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (input.from.x + input.from.width / 2) * page.width;
  const cy = (input.from.y + input.from.height / 2) * page.height;
  try {
    return displayUnitAffineToPdfUserSpace({
      pageGeometry: input.pageGeometry,
      matrix: { a: cos, b: sin, c: -sin, d: cos, e: cx - cos * cx + sin * cy, f: cy - sin * cx - cos * cy },
    });
  } catch {
    return null;
  }
}

function lineThicknessChange(input: {
  readonly route: PdfNativeVectorSelectionRoute;
  readonly pageGeometry: PdfVectorPageGeometry;
  readonly from: NativeVectorBox;
  readonly to: NativeVectorBox;
  readonly mirror?: Readonly<{ x: boolean; y: boolean }> | null;
  readonly items?: readonly PdfVectorContentItem[];
}) {
  const { route, from, to, items } = input;
  if (input.mirror?.x || input.mirror?.y || !items) return null;
  const page = nativeVectorPagePoints(input.pageGeometry, 1);
  const axis = nativeVectorStraightLineAxis(route, items, page);
  const ends = nativeVectorDisplayAnchors(route, items);
  const reach = nativeVectorRouteItem(route, items)?.strokeReach;
  const stroke = reach && page
    ? 2 * (axis === "horizontal" ? reach.y * page.height : reach.x * page.width)
    : nativeVectorStrokePoints(route, items);
  if (!page || !axis || !ends || ends.length !== 2 || !stroke || !(stroke > 0)) return null;
  const same = (left: number, right: number) => Math.abs(left - right) <= 1e-9;
  const across =
    axis === "horizontal"
      ? same(from.x, to.x) && same(from.width, to.width) && { was: from.height * page.height, now: to.height * page.height }
      : same(from.y, to.y) && same(from.height, to.height) && { was: from.width * page.width, now: to.width * page.width };
  if (!across) return null;
  const stray = Math.max(0, across.was - stroke);
  const thickness = across.now - stray;
  if (!(thickness > 0)) return null;
  return {
    scale: thickness / stroke, page, ends,
    fromX: (from.x + from.width / 2) * page.width, fromY: (from.y + from.height / 2) * page.height,
    toX: (to.x + to.width / 2) * page.width, toY: (to.y + to.height / 2) * page.height,
  };
}

function nativeVectorLineThicknessTransform(input: {
  readonly route: PdfNativeVectorSelectionRoute;
  readonly pageGeometry: PdfVectorPageGeometry;
  readonly from: NativeVectorBox;
  readonly to: NativeVectorBox;
  readonly mirror?: Readonly<{ x: boolean; y: boolean }> | null;
  readonly items?: readonly PdfVectorContentItem[];
}): PdfNativeVectorAffineTransform | null {
  const { route, from, to, items } = input;
  if (input.mirror?.x || input.mirror?.y || !items) return null;
  // In the page's own units as shown, equal on both axes.
  const page = nativeVectorPagePoints(input.pageGeometry, 1);
  const axis = nativeVectorStraightLineAxis(route, items, page);
  const ends = nativeVectorDisplayAnchors(route, items);
  // The stroke's depth across the line as painted: per axis where the
  // renderer says (a rule already pulled into a bar), else its width.
  const reach = nativeVectorRouteItem(route, items)?.strokeReach;
  const stroke = reach && page
    ? 2 * (axis === "horizontal" ? reach.y * page.height : reach.x * page.width)
    : nativeVectorStrokePoints(route, items);
  if (!page || !axis || !ends || ends.length !== 2 || !stroke || !(stroke > 0)) return null;
  const same = (left: number, right: number) => Math.abs(left - right) <= 1e-9;
  const across =
    axis === "horizontal"
      ? same(from.x, to.x) && same(from.width, to.width) && { was: from.height * page.height, now: to.height * page.height }
      : same(from.y, to.y) && same(from.height, to.height) && { was: from.width * page.width, now: to.width * page.width };
  if (!across) return null;
  // The frame is the path's extent grown by the stroke: what is not stroke
  // is the line's own stray across its axis, which the scale leaves alone.
  const stray = Math.max(0, across.was - stroke);
  const thickness = across.now - stray;
  if (!(thickness > 0)) return null;
  const scale = thickness / stroke;
  const dx = (ends[1].x - ends[0].x) * page.width;
  const dy = (ends[1].y - ends[0].y) * page.height;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return null;
  // Unit along the line and along its normal; the scale is k = 1 + (scale -
  // 1) n n^T, taken about the old frame's middle onto the new one's.
  const nx = -dy / length;
  const ny = dx / length;
  const k = scale - 1;
  const a = 1 + k * nx * nx;
  const b = k * nx * ny;
  const c = k * nx * ny;
  const d = 1 + k * ny * ny;
  const fromX = (from.x + from.width / 2) * page.width;
  const fromY = (from.y + from.height / 2) * page.height;
  const toX = (to.x + to.width / 2) * page.width;
  const toY = (to.y + to.height / 2) * page.height;
  return displayUnitAffineToPdfUserSpace({
    pageGeometry: input.pageGeometry,
    matrix: { a, b, c, d, e: toX - (a * fromX + c * fromY), f: toY - (b * fromX + d * fromY) },
  });
}

/** A shape counts as lying along an axis when it strays from it by less. */
const STRAIGHT_LINE_AXIS_POINTS = 0.05;

/**
 * A straight line lying along the page's x or y axis as shown: WPS frames it
 * by its thickness, with a dot at each end and one thickness grip (a
 * slanted line gets the box and its eight grips instead).
 */
export function nativeVectorStraightLineAxis(
  route: PdfNativeVectorSelectionRoute,
  items: readonly PdfVectorContentItem[] | undefined,
  page: Readonly<{ width: number; height: number }> | null,
): "horizontal" | "vertical" | null {
  if (route.nativeKind !== "line" || !page) return null;
  if (!nativeVectorRouteItem(route, items)) {
    // A stand-in holding a saving line's place has only the box it was left
    // in: a long thin box is still that line lying along its long side.
    const width = route.bounds.width * page.width;
    const height = route.bounds.height * page.height;
    return height * 8 <= width ? "horizontal" : width * 8 <= height ? "vertical" : null;
  }
  const ends = nativeVectorDisplayAnchors(route, items);
  if (!ends || ends.length !== 2) return null;
  const dxPoints = Math.abs(ends[1].x - ends[0].x) * page.width;
  const dyPoints = Math.abs(ends[1].y - ends[0].y) * page.height;
  if (dyPoints <= STRAIGHT_LINE_AXIS_POINTS && dxPoints > STRAIGHT_LINE_AXIS_POINTS) {
    return "horizontal";
  }
  if (dxPoints <= STRAIGHT_LINE_AXIS_POINTS && dyPoints > STRAIGHT_LINE_AXIS_POINTS) {
    return "vertical";
  }
  return null;
}

/**
 * The turned frame a selected source vector stands in, as PowerPoint and
 * WPS keep one for a turned shape: its own (unturned) box in page percent
 * about its centre, and its angle (clockwise degrees on screen). A slanted
 * straight line stands along itself (its length by its stroke) -- reloaded
 * too, since the line says its angle; a shape turned in this session keeps
 * the frame it was turned in (`turn`, `size`: what its writes carried). Null
 * for an upright frame: the box around the shape is then its frame.
 */
export function nativeVectorTurnedFrame(input: {
  readonly route: PdfNativeVectorSelectionRoute;
  readonly items: readonly PdfVectorContentItem[] | undefined;
  /** The page as shown, in the points `size` is measured in. */
  readonly page: Readonly<{ width: number; height: number }> | null;
  /** nativeVectorFrameBounds: the box around the shape (page fractions). */
  readonly bounds: NativeVectorBox;
  readonly turn?: number;
  readonly size?: Readonly<{ width: number; height: number }>;
}): { rect: { x: number; y: number; width: number; height: number }; rotation: number; line: boolean } | null {
  const { route, items, page, bounds } = input;
  if (!page || !(page.width > 0) || !(page.height > 0)) return null;
  const percentAbout = (cx: number, cy: number, width: number, height: number) => ({
    x: (cx - width / 2 / page.width) * 100,
    y: (cy - height / 2 / page.height) * 100,
    width: (width / page.width) * 100,
    height: (height / page.height) * 100,
  });
  if (route.proofFamily === "shape" && route.nativeKind === "line") {
    const ends = nativeVectorDisplayAnchors(route, items);
    if (ends && ends.length === 2) {
      const dx = (ends[1].x - ends[0].x) * page.width;
      const dy = (ends[1].y - ends[0].y) * page.height;
      const length = Math.hypot(dx, dy);
      if (length > 0.5) {
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        // Read left to right, never upside down.
        if (angle > 90) angle -= 180;
        if (angle <= -90) angle += 180;
        // Along an axis: the upright line chrome already fits it.
        if (Math.abs(angle) < 0.05 || Math.abs(Math.abs(angle) - 90) < 0.05) return null;
        const stroke = Math.max(0.1, nativeVectorStrokePoints(route, items) ?? 1);
        return {
          rect: percentAbout(
            (ends[0].x + ends[1].x) / 2,
            (ends[0].y + ends[1].y) / 2,
            length,
            stroke,
          ),
          rotation: angle,
          line: true,
        };
      }
    }
  }
  const turn = input.turn ?? 0;
  const size = input.size;
  if (!size || Math.abs(turn % 360) < 1e-6 || !(size.width > 0) || !(size.height > 0)) return null;
  return {
    rect: percentAbout(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, size.width, size.height),
    rotation: turn > 180 ? turn - 360 : turn,
    line: false,
  };
}

/**
 * One frame gesture on a turned frame (`start` its unturned box in page
 * percent, `dx`/`dy` the pointer's travel in page percent): a move carries
 * it, a grip resizes it along its own axes with the opposite side or corner
 * held. Only an axis a grip pulls has a smallest size: a line's ends keep
 * its stroke as it was (a floor on its thickness would thicken it).
 */
export function transformTurnedVectorFrame(
  start: { x: number; y: number; width: number; height: number },
  mode: string,
  dx: number,
  dy: number,
  options: {
    readonly rotation: number;
    readonly pageWidth: number;
    readonly pageHeight: number;
    readonly minSide?: number;
    /** How much of its box stays on the page when moved past an edge. */
    readonly keepPixels?: number;
  },
): { x: number; y: number; width: number; height: number } {
  const { pageWidth, pageHeight } = options;
  if (!(pageWidth > 0) || !(pageHeight > 0)) return start;
  const radians = (options.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  if (mode === "move") {
    // Partly past the page edge, as WPS takes a shape, with a strip of it
    // (its box's) left on the page: wholly off, the write is refused.
    const w = (start.width / 100) * pageWidth;
    const h = (start.height / 100) * pageHeight;
    const halfX = (Math.abs(w * cos) + Math.abs(h * sin)) / 2;
    const halfY = (Math.abs(w * sin) + Math.abs(h * cos)) / 2;
    const keep = Math.max(0, options.keepPixels ?? 24);
    const keepX = Math.min(2 * halfX, keep);
    const keepY = Math.min(2 * halfY, keep);
    const cx = ((start.x + start.width / 2) / 100) * pageWidth;
    const cy = ((start.y + start.height / 2) / 100) * pageHeight;
    const nx = Math.min(Math.max(cx + (dx / 100) * pageWidth, keepX - halfX), pageWidth - keepX + halfX);
    const ny = Math.min(Math.max(cy + (dy / 100) * pageHeight, keepY - halfY), pageHeight - keepY + halfY);
    return { ...start, x: start.x + ((nx - cx) / pageWidth) * 100, y: start.y + ((ny - cy) / pageHeight) * 100 };
  }
  const travelX = (dx / 100) * pageWidth;
  const travelY = (dy / 100) * pageHeight;
  const localX = travelX * cos + travelY * sin;
  const localY = -travelX * sin + travelY * cos;
  const boxWidth = (start.width / 100) * pageWidth;
  const boxHeight = (start.height / 100) * pageHeight;
  const minSide = Math.max(1, options.minSide ?? 4);
  const east = mode.includes("e");
  const west = mode.includes("w");
  const south = mode.includes("s");
  const north = mode.includes("n");
  let width = boxWidth;
  let height = boxHeight;
  if (east) width = Math.max(minSide, boxWidth + localX);
  if (west) width = Math.max(minSide, boxWidth - localX);
  if (south) height = Math.max(minSide, boxHeight + localY);
  if (north) height = Math.max(minSide, boxHeight - localY);
  const shiftLocalX = east ? (width - boxWidth) / 2 : west ? -(width - boxWidth) / 2 : 0;
  const shiftLocalY = south ? (height - boxHeight) / 2 : north ? -(height - boxHeight) / 2 : 0;
  const cx = ((start.x + start.width / 2) / 100) * pageWidth + shiftLocalX * cos - shiftLocalY * sin;
  const cy = ((start.y + start.height / 2) / 100) * pageHeight + shiftLocalX * sin + shiftLocalY * cos;
  return {
    x: ((cx - width / 2) / pageWidth) * 100,
    y: ((cy - height / 2) / pageHeight) * 100,
    width: (width / pageWidth) * 100,
    height: (height / pageHeight) * 100,
  };
}
