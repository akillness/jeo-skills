"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isValidElement, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from "react";
import { flushSync } from "react-dom";

import type { SpreadsheetGridCanvasCells, GridCanvasCellPaint, GridCanvasCellEdge } from "./SpreadsheetGridCanvasLayer";
import { SpreadsheetErrorIndicatorMark } from "./SpreadsheetErrorIndicators";
import { SpreadsheetAngledBand, angledBandStrokes } from "./SpreadsheetAngledCell";
import { borderLineStrokeSpec, dashDotEdgeLayers, normalizeBorderEdges, AUTOMATIC_BORDER_COLOR, type CellBorderStyle } from "@mrnote/core/web/lib/spreadsheet/cell-format.ts";













let canvasRowsSwitch: boolean | undefined;
// Read as the module loads: the workspace rewrites its address once a page opens.
const addressSwitch = typeof window === "undefined" ? null : /[?&]gridCanvasRows=([01])/.exec(window.location.search)?.[1] ?? null;

export function gridCanvasRowsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (canvasRowsSwitch !== undefined) return canvasRowsSwitch;
  let asked = addressSwitch ?? /[?&]gridCanvasRows=([01])/.exec(window.location.search)?.[1] ?? null;
  if (asked === null) {
    try {
      asked = window.localStorage.getItem("mrai.gridCanvasRows");
    } catch {
      asked = null;
    }
  }
  canvasRowsSwitch = asked !== "0";
  return canvasRowsSwitch;
}

/**
 * Where a run of frozen cells is pinned, as the cells' own sticky boxes had
 * it: a frozen column's at `offset` from the edge the sheet starts at
 * (`side`), a frozen row's at `top`, the corner's at both, and its layer;
 * `edge` when it holds the last frozen column (the divider).
 */
function addressedSwitch(name: string, storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  const asked = new RegExp(`[?&]${name}=([01])`).exec(window.location.search)?.[1] ?? null;
  if (asked !== null) return asked;
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

let restingCellsSwitch: boolean | undefined;









export function gridRestingCellsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  restingCellsSwitch ??= addressedSwitch("gridRestingCells", "mrai.gridRestingCells") !== "0";
  return restingCellsSwitch;
}

let restingVerifySwitch: boolean | undefined;
/**
 * Every resting cell worked out without its element is checked against its
 * element's own answer (`?gridRestingVerify=1`): a difference is tallied in
 * `window.__gridRestingVerify` and the element is used.
 */
export function gridRestingVerifyEnabled(): boolean {
  if (typeof window === "undefined") return false;
  restingVerifySwitch ??= addressedSwitch("gridRestingVerify", "mrai.gridRestingVerify") === "1";
  return restingVerifySwitch;
}

/** The verification's tally (see {@link gridRestingVerifyEnabled}). */
export function noteRestingVerify(key: string, same: boolean, detail: () => unknown): void {
  if (typeof window === "undefined") return;
  const box = window as unknown as { __gridRestingVerify?: { checked: number; differ: number; samples: unknown[] } };
  const tally = (box.__gridRestingVerify ??= { checked: 0, differ: 0, samples: [] });
  tally.checked += 1;
  if (same) return;
  tally.differ += 1;
  if (tally.samples.length < 40) tally.samples.push({ key, ...(detail() as object) });
}

export type CanvasRunPin = { side?: "left" | "right"; offset?: number; top?: number; zIndex: number; edge: boolean };

function samePin(a: CanvasRunPin, b: CanvasRunPin): boolean {
  return a.side === b.side && a.offset === b.offset && a.top === b.top && a.zIndex === b.zIndex;
}
/** A run's columns, and the merged cells in it: an anchor's column → the columns it spans (it and the covered ones after it). */
export type CanvasRun = {
  run: number[]; keys: string[]; pin?: CanvasRunPin; spans?: Record<number, number>;
  /** A merge across rows: its anchor alone, as tall as the rows it spans (the rows below render nothing there). */
  rowSpan?: number;
};
export type CanvasRowItem = { node: ReactNode } | CanvasRun;

/**
 * A resting cell the grid worked out without its element: its paint (as
 * {@link canvasCellPaint} reads the element's, with its marks and tint), its
 * spans, and the element itself, made only when the row needs it (the row
 * keeps its elements, or a pointer brings the cells back).
 */
export type RestingCanvasCell = {
  readonly restingCanvasCell: true;
  readonly paint: GridCanvasCellPaint;
  readonly colSpan: number;
  readonly rowSpan: number;
  readonly element: () => ReactNode;
};

export type CanvasRowNode = ReactNode | RestingCanvasCell;

export function isRestingCanvasCell(node: unknown): node is RestingCanvasCell {
  return typeof node === "object" && node !== null && (node as { restingCanvasCell?: unknown }).restingCanvasCell === true;
}

/** The row's cells as elements: a resting cell's made now. */
export function canvasRowElements(nodes: readonly CanvasRowNode[]): ReactNode[] {
  return nodes.map((node) => (isRestingCanvasCell(node) ? node.element() : node));
}

const BORDER = /^(\d+(?:\.\d+)?)px\s+(solid|dashed|dotted|double|hidden|none)(?:\s+(.+))?$/;
/** Style keys the canvas cannot paint: a cell wearing one keeps its element. */
const UNPAINTED = /^(background(?!Color$).*|boxShadow|outline.*|opacity|filter|transform.*|position|zIndex|backdropFilter|mixBlendMode|clipPath|mask.*)$/;
const EDGE_KEYS = { borderTop: "top", borderRight: "right", borderBottom: "bottom", borderLeft: "left" } as const;

function plainColor(value: unknown): string | null {
  return typeof value === "string" && value && !value.includes("var(") ? value : null;
}

function edgeOf(value: unknown): GridCanvasCellEdge | null | undefined {
  if (typeof value !== "string") return undefined;
  if (/^(none|hidden|0(px)?)$/.test(value.trim())) return null;
  const match = BORDER.exec(value.trim());
  if (!match) return undefined;
  if (match[2] === "hidden" || match[2] === "none") return null;
  const color = match[3] ? plainColor(match[3]) : "#000000";
  if (!color) return undefined;
  return { width: Number(match[1]), style: match[2] as GridCanvasCellEdge["style"], color };
}

/** Background keys the grid writes for the dash-dot edges CSS cannot draw (dashDotEdgeLayers). */
const EDGE_LAYER_KEYS = new Set(["backgroundImage", "backgroundSize", "backgroundPosition", "backgroundRepeat", "backgroundOrigin"]);

/**
 * The paint of a cell's own box (fill and borders), or undefined when the
 * canvas cannot paint it. `source`: the cell's own style, whose dash-dot and
 * hair edges the grid draws as background strips over transparent borders;
 * the canvas strokes them in their rhythm instead.
 */
/** The style key that last kept a cell off the canvas (canvasCellPaint), for the probe's tally. */
let paintRefusal = "";

export function canvasCellPaint(style: CSSProperties | undefined, source?: CellBorderStyle): GridCanvasCellPaint | undefined {
  const paint: GridCanvasCellPaint = {};
  const refuse = (key: string) => {
    paintRefusal = key;
    return undefined;
  };
  const layered = source ? dashDotEdgeLayers(source) : undefined;
  const layerImages = layered?.layers.map((layer) => layer.image).join(", ") ?? "";
  const edgeLayers = Boolean(layerImages) && style?.backgroundImage === layerImages;
  for (const [key, value] of Object.entries(style ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (edgeLayers && EDGE_LAYER_KEYS.has(key)) continue;
    if (UNPAINTED.test(key)) {
      // A key set to what draws nothing is no paint: a conditional fill
      // writes backgroundImage "none" over the cell's pattern (4,300 cells of
      // the fidelity corpus kept their elements for it).
      if (value === "none" || (key === "opacity" && Number(value) === 1)) continue;
      return refuse(key);
    }
    if (key === "backgroundColor") {
      if (value === "transparent") continue;
      const color = plainColor(value);
      if (!color) return refuse("backgroundColor value");
      paint.fill = color;
      continue;
    }
    if (key === "border") {
      const edge = edgeOf(value);
      if (edge === undefined) return refuse("border value");
      if (edge) paint.top = paint.right = paint.bottom = paint.left = edge;
      continue;
    }
    if (key in EDGE_KEYS) {
      const edge = edgeOf(value);
      if (edge === undefined) return refuse(`${key} value`);
      const side = EDGE_KEYS[key as keyof typeof EDGE_KEYS];
      if (edge) paint[side] = edge;
      else delete paint[side];
      continue;
    }
    if (key === "borderRightColor" || key === "borderBottomColor") {
      // A filled cell's gridlines take its fill (Excel paints the fill over them).
      const color = plainColor(value);
      if (!color) return refuse(`${key} value`);
      paint.lines = { ...paint.lines, [key === "borderRightColor" ? "right" : "bottom"]: color };
      continue;
    }
    // Its top and left gridlines are its neighbours' right and bottom ones,
    // which win the collapsed tie with a same-width line.
    if (key === "borderTopColor" || key === "borderLeftColor") continue;
    if (key.startsWith("border")) return refuse(key);
  }
  if (edgeLayers && layered) {
    const edges = normalizeBorderEdges(source?.borderEdges);
    for (const [key, side] of Object.entries(EDGE_KEYS) as Array<[keyof typeof EDGE_KEYS, (typeof EDGE_KEYS)[keyof typeof EDGE_KEYS]]>) {
      const edge = edges?.[side];
      if (!layered.borders[key] || !edge) continue;
      const spec = borderLineStrokeSpec(edge.style);
      paint[side] = { width: spec.width, style: "solid", color: edge.color ?? AUTOMATIC_BORDER_COLOR, ...(spec.dash ? { dash: spec.dash } : {}) };
    }
  }
  return paint;
}

function empty(children: ReactNode): boolean {
  if (children === null || children === undefined || children === false || children === true || children === "") return true;
  if (Array.isArray(children)) return children.every(empty);
  // Error checking's triangle and a data bar with its axis, which the canvas paints.
  if (isValidElement(children) && children.type === SpreadsheetErrorIndicatorMark) return true;
  if (isNoteMark(children)) return true;
  if (isValidElement(children) && children.type === SpreadsheetAngledBand) return true;
  if (isValidElement(children) && children.type === "span") {
    const className = (children.props as { className?: unknown }).className;
    return className === "spreadsheet-window__data-bar" || className === "spreadsheet-window__data-bar-axis" || className === "spreadsheet-window__cond-icon";
  }
  return false;
}

/** A px length of a style, or null for none/auto. */
function pxOf(value: unknown): number | null | undefined {
  if (value === undefined || value === "auto") return null;
  if (typeof value === "number") return value;
  return undefined;
}

/** The conditional-format icon a resting cell's layer shows; null for none, undefined for one the canvas cannot place. */
function conditionalIconOf(children: ReactNode): GridCanvasCellPaint["icon"] | null | undefined {
  for (const span of childSpans(children)) {
    if (span.props.className !== "spreadsheet-window__cond-icon") continue;
    const props = span.props as Record<string, unknown> & { style?: CSSProperties };
    const set = props["data-icon-set"], index = Number(props["data-icon-index"]), count = Number(props["data-icon-count"] ?? 3);
    if (typeof set !== "string" || !Number.isFinite(index) || !Number.isFinite(count)) return undefined;
    const style = props.style ?? {};
    const top = pxOf(style.top), bottom = pxOf(style.bottom), height = pxOf(style.height);
    if (top === undefined || bottom === undefined || height === undefined) return undefined;
    return { set, index, count, top: style.top === undefined ? 0 : top, bottom: style.bottom === undefined ? 0 : bottom, height };
  }
  return null;
}

/** A note's mark (Excel's red corner triangle; a threaded comment's bubble is a button of its own and keeps the element). */
function isNoteMark(node: ReactNode): boolean {
  if (!isValidElement(node) || node.type !== "button") return false;
  const props = node.props as Record<string, unknown>;
  return props["data-testid"] === "spreadsheet-comment-indicator" && props["data-kind"] === "note";
}

function hasNoteMark(children: ReactNode): boolean {
  if (Array.isArray(children)) return children.some(hasNoteMark);
  return isNoteMark(children);
}

/** A band cell's band as the canvas paints it; null for none, undefined for one it cannot (a colour it cannot resolve). */
function angledBandOf(children: ReactNode): GridCanvasCellPaint["band"] | null | undefined {
  const found: ReactElement[] = [];
  const walk = (node: ReactNode) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isValidElement(node) && node.type === SpreadsheetAngledBand) found.push(node);
  };
  walk(children);
  const element = found[0];
  if (!element) return null;
  const { band, width, edges, scale } = element.props as Parameters<typeof SpreadsheetAngledBand>[0];
  const usable = (color: string | undefined) => !color || (!color.includes("var(") && color !== "currentColor");
  if (!usable(edges.fill)) return undefined;
  const strokes = angledBandStrokes(band, width, edges, scale);
  if (strokes.some((stroke) => !usable(stroke.color))) return undefined;
  const xs = band.corners.map(([x]) => x);
  return {
    corners: band.corners,
    ...(edges.fill ? { fill: edges.fill } : {}),
    strokes: strokes.map((stroke) => ({
      x1: stroke.x1, y1: stroke.y1, x2: stroke.x2, y2: stroke.y2, color: stroke.color, width: stroke.width,
      ...(stroke.dash ? { dash: stroke.dash.split(/\s+/).map(Number) } : {}),
    })),
    reachLeft: Math.max(0, -Math.min(...xs)) + 2,
    reachRight: Math.max(0, Math.max(...xs) - width) + 2,
  };
}

function hasErrorMark(children: ReactNode): boolean {
  if (Array.isArray(children)) return children.some(hasErrorMark);
  return isValidElement(children) && children.type === SpreadsheetErrorIndicatorMark;
}

/** A share of the cell's box from a CSS percentage ("37.5%"). */
function shareOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(-?\d*\.?\d+)%$/.exec(value.trim());
  return match ? Number(match[1]) / 100 : null;
}

/** A data bar's or its axis's share of Excel's box (DATA_BAR_BOX): the
 * percent of `dataBarBoxLeft` / `dataBarPaintCss`, whose px term is the box. */
function boxShareOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^calc\((-?\d*\.?\d+)% [+-] \d*\.?\d+px\)$/.exec(value.trim());
  return match ? Number(match[1]) / 100 : shareOf(value);
}

function childSpans(children: ReactNode, into: ReactElement<{ className?: unknown; style?: CSSProperties }>[] = []) {
  if (Array.isArray(children)) for (const child of children) childSpans(child, into);
  else if (isValidElement(children) && children.type === "span") into.push(children as ReactElement<{ className?: unknown; style?: CSSProperties }>);
  return into;
}

/**
 * The data bar a resting cell's layers draw, as the canvas paints it; null
 * for none, undefined when the canvas cannot paint the one it has.
 */
function dataBarOf(children: ReactNode): GridCanvasCellPaint["bar"] | null | undefined {
  let bar: GridCanvasCellPaint["bar"] | null = null;
  let axis: { at: number; color: string } | undefined;
  for (const span of childSpans(children)) {
    const style = span.props.style ?? {};
    if (span.props.className === "spreadsheet-window__data-bar-axis") {
      const at = boxShareOf(style.left);
      const color = typeof style.borderLeftColor === "string" ? style.borderLeftColor : null;
      if (at === null || !color || color.includes("var(")) return undefined;
      axis = { at, color };
      continue;
    }
    if (span.props.className !== "spreadsheet-window__data-bar") continue;
    const start = boxShareOf(style.left), width = boxShareOf(style.width);
    const color = typeof style.backgroundColor === "string" ? style.backgroundColor : null;
    if (start === null || width === null || !color || color.includes("var(")) return undefined;
    const image = style.backgroundImage;
    const gradient = image === undefined ? undefined : /^linear-gradient\(to (left|right), /.exec(String(image))?.[1] as "left" | "right" | undefined;
    if (image !== undefined && !gradient) return undefined;
    const border = style.border === undefined ? undefined : /^1px solid (.+)$/.exec(String(style.border))?.[1];
    if (style.border !== undefined && !border) return undefined;
    bar = { start, width, color, ...(gradient ? { gradient } : {}), ...(border ? { border } : {}) };
  }
  if (axis) {
    if (!bar) return undefined;
    bar = { ...bar, axis };
  }
  return bar;
}

/** The attributes of a cell that needs its element: shown state, links (their screen tip), markers.
 * A resting cell's own press, click and double click (they mount its editor)
 * are not among them: the run brings the cells back before a press lands. */
const LIVE_ATTRIBUTES = ["data-cut", "data-fill-preview", "data-special-mark", "data-reading-crosshair", "data-selection-edges", "data-frozen", "data-editing", "title"];

/** The attributes a frozen-column cell at rest may wear and still be pinned on the canvas. */
const PINNABLE_LIVE_ATTRIBUTES = LIVE_ATTRIBUTES.filter((name) => name !== "data-frozen");

/**
 * Why a cell keeps its element; null for a cell at rest the canvas can take,
 * "pinnable" for a frozen-column one (`data-canvas-pinnable`: the grid marks
 * it when nothing but its text and box is drawn, and its text is in the store).
 */
function keptBecause(node: ReactNode): string | null {
  if (!isValidElement(node) || node.type !== "td") return node === null ? "covered" : "not a cell";
  const props = node.props as Record<string, unknown>;
  if (props["data-canvas-pinnable"] === "") {
    if (props["data-active"] === "true") return "active";
    if (props.rowSpan || props.colSpan) return "span";
    return PINNABLE_LIVE_ATTRIBUTES.find((name) => props[name] !== undefined) ?? "pinnable";
  }
  if (props["data-ghost-cell"] !== "") return "editor";
  if (props["data-active"] === "true") return "active";
  const live = LIVE_ATTRIBUTES.find((name) => props[name] !== undefined);
  if (live) return live;
  return empty(props.children as ReactNode) ? null : "content";
}

/** Counts of why cells kept their elements, and of the rows rendered, when `window.__gridCanvasRowsWhy` is an object (a probe sets it). */
function noteKept(reason: string) {
  const tally = typeof window !== "undefined" ? (window as unknown as { __gridCanvasRowsWhy?: Record<string, number> }).__gridCanvasRowsWhy : undefined;
  if (tally) tally[reason] = (tally[reason] ?? 0) + 1;
}

/** For the same probe: why a cell's text is not on the canvas (`reason` is asked only while the probe runs). */
export function noteCanvasTextRefusal(reason: () => string | null) {
  if (typeof window === "undefined" || !(window as unknown as { __gridCanvasRowsWhy?: unknown }).__gridCanvasRowsWhy) return;
  const why = reason();
  if (why) noteKept(`text: ${why}`);
}

/** Fewer cells than this at rest and the row keeps its elements: nothing to gain. */
const MIN_RUN_CELLS = 4;

/**
 * A cell's answer by its element: the grid reuses a cell's element while
 * nothing it shows changed, so a row drawn again (a font arriving, the band
 * moving) reads its cells' paints instead of working them out again. Kept
 * with what else it read (the edge style its neighbours leave it, the
 * sheet's direction).
 */
type CellAnswer = { kept: string | null; source: unknown; rtl: boolean; paint?: GridCanvasCellPaint; pin?: CanvasRunPin; refusal: string };
const cellAnswers = new WeakMap<object, CellAnswer>();

/**
 * The row as runs of resting cells and the cells that keep their elements,
 * recording each resting cell's paint; null when the row keeps all of them.
 */
export function canvasRowRuns(
  nodes: readonly CanvasRowNode[],
  cols: readonly number[],
  row: number,
  paints: SpreadsheetGridCanvasCells,
  /** A cell's own style, for the edges the grid draws as background strips. */
  styleAt?: (row: number, col: number) => CellBorderStyle | undefined,
  /** The sheet runs right to left (its marks sit at the cells' right). */
  rtl = false,
): CanvasRowItem[] | null {
  noteKept("rows rendered");
  // Too few cells could be at rest: the row keeps its elements, and no cell's
  // paint is worked out (most rows of a sheet still loading are such rows).
  const keptOf = nodes.map((node) => (node === null ? "covered" : isRestingCanvasCell(node) ? null : isValidElement(node) ? (cellAnswers.get(node)?.kept ?? keptBecause(node)) : "not a cell"));
  let candidates = 0;
  for (const kept of keptOf) if (kept === null || kept === "pinnable") candidates += 1;
  if (candidates < MIN_RUN_CELLS) {
    paints.noteRow(false);
    if (typeof window !== "undefined" && (window as unknown as { __gridCanvasRowsWhy?: unknown }).__gridCanvasRowsWhy) {
      for (const kept of keptOf) noteKept(kept ?? "few at rest");
    }
    return null;
  }
  const items: CanvasRowItem[] = [];
  let run: CanvasRun | null = null;
  let resting = 0;
  const pending: Array<[string, GridCanvasCellPaint]> = [];
  // The covered columns after a merged anchor taken into a run: they go in with it.
  let covered = 0;
  nodes.forEach((node, index) => {
    if (covered > 0) {
      covered -= 1;
      return;
    }
    let kept = keptOf[index];
    const precomputed = isRestingCanvasCell(node) ? node : null;
    // A merge across columns is a cell of the run as wide as its columns; one
    // across rows is a run of its own as tall as its rows.
    const span = precomputed ? precomputed.colSpan : kept === null ? Number((node as ReactElement<{ colSpan?: number }>).props.colSpan ?? 1) : 1;
    const rowSpan = precomputed ? precomputed.rowSpan : kept === null ? Number((node as ReactElement<{ rowSpan?: number }>).props.rowSpan ?? 1) : 1;
    // Its covered columns are the next ones, rendered as nothing.
    if (span > 1 && (index + span > nodes.length || nodes.slice(index + 1, index + span).some((next) => next !== null))) kept = "span";
    const props = !precomputed && (kept === null || kept === "pinnable") ? (node as ReactElement<Record<string, unknown> & { style?: CSSProperties }>).props : null;
    const source = props ? styleAt?.(row, cols[index]) : undefined;
    const known = props ? cellAnswers.get(node as object) : undefined;
    const answer: CellAnswer | null = precomputed
      ? (kept === null ? { kept, source: undefined, rtl, paint: precomputed.paint, refusal: "" } : { kept, source: undefined, rtl, refusal: kept ?? "" })
      : known && known.kept === kept && known.source === source && known.rtl === rtl
        ? known
        : props ? answerOf(kept, props, source, rtl) : null;
    if (answer && !precomputed && answer !== known) cellAnswers.set(node as object, answer);
    const pin = answer?.pin;
    const paint = answer?.paint;
    if (!paint) {
      noteKept(answer ? answer.refusal : kept ?? "style");
      run = null;
      items.push({ node: precomputed ? precomputed.element() : (node as ReactNode) });
      return;
    }
    const key = `${row}:${cols[index]}`;
    // A pinned run holds the frozen cells of one pin (one sticky box); the
    // cells that scroll start a run of their own.
    // (A frozen row's cells all stick at one top; frozen columns' cells each at their own offset, the run at its first's.)
    if (run && (rowSpan > 1 || run.rowSpan || (pin ? !run.pin || !samePin({ ...run.pin, offset: pin.offset }, pin) : Boolean(run.pin)))) run = null;
    if (!run) items.push((run = pin ? { run: [], keys: [], pin: { ...pin } } : rowSpan > 1 ? { run: [], keys: [], rowSpan } : { run: [], keys: [] }));
    if (pin && run.pin) {
      // The box sticks where its first cell would; it holds the divider when any cell does.
      if (pin.edge) run.pin.edge = true;
    }
    run.run.push(cols[index]);
    run.keys.push(key);
    if (span > 1) {
      (run.spans ??= {})[cols[index]] = span;
      for (let next = 1; next < span; next += 1) {
        run.run.push(cols[index + next]);
        run.keys.push(`${row}:${cols[index + next]}`);
      }
      covered = span - 1;
    }
    pending.push([key, paint]);
    resting += 1;
  });
  paints.noteRow(resting >= MIN_RUN_CELLS);
  if (resting < MIN_RUN_CELLS) return null;
  for (const [key, paint] of pending) paints.set(key, paint);
  return items;
}

/**
 * What the canvas makes of one cell element on its own: its paint when it is
 * a resting cell the canvas can take, else why it keeps its element. The
 * yardstick a cell's paint worked out without its element is checked against
 * (the grid's `?gridRestingVerify=1`).
 */
export function canvasCellAnswer(
  node: ReactNode,
  source: CellBorderStyle | undefined,
  rtl = false,
): { paint?: GridCanvasCellPaint; kept: string | null; refusal: string } {
  if (node === null) return { kept: "covered", refusal: "covered" };
  if (!isValidElement(node)) return { kept: "not a cell", refusal: "not a cell" };
  const kept = keptBecause(node);
  if (kept !== null) return { kept, refusal: kept };
  const answer = answerOf(kept, node.props as Record<string, unknown> & { style?: CSSProperties }, source, rtl);
  return { kept: answer.kept, refusal: answer.refusal, ...(answer.paint ? { paint: answer.paint } : {}) };
}

/** What the canvas paints of a cell the row may take (a resting cell, or a frozen one it can pin), or why it keeps its element. */
function answerOf(kept: string | null, props: Record<string, unknown> & { style?: CSSProperties }, source: CellBorderStyle | undefined, rtl: boolean): CellAnswer {
  const pin = kept === "pinnable" ? pinOf(props) : undefined;
  const bar = kept === null ? dataBarOf(props.children as ReactNode) : null;
  const icon = kept === null ? conditionalIconOf(props.children as ReactNode) : null;
  const band = kept === null ? angledBandOf(props.children as ReactNode) : null;
  const painted = (kept === null || pin) && bar !== undefined && icon !== undefined && band !== undefined
    ? canvasCellPaint(pin ? unpinnedStyle(props.style) : props.style, source)
    : undefined;
  const refusal = kept === "pinnable"
    ? (pin ? `pinned style: ${paintRefusal}` : "pin")
    : kept ?? (bar === undefined ? "data bar" : icon === undefined ? "icon" : band === undefined ? "band" : `style: ${paintRefusal}`);
  if (!painted) return { kept, source, rtl, refusal };
  const marked = kept === null && hasErrorMark(props.children as ReactNode);
  const noted = kept === null && hasNoteMark(props.children as ReactNode);
  const drawn: GridCanvasCellPaint = bar || marked || icon || noted || band
    ? {
        ...painted, ...(bar ? { bar } : {}), ...(icon ? { icon } : {}), ...(band ? { band } : {}),
        ...(marked ? { errorMark: rtl ? "right" as const : "left" as const } : {}),
        // At the cell's end: the right, or the left in a sheet that runs right to left.
        ...(noted ? { noteMark: rtl ? "left" as const : "right" as const } : {}),
      }
    : painted;
  // Inside a selected range (its edge cells and the active cell keep their elements): the tint.
  const paint = props["data-selected"] === "true" ? { ...drawn, tint: true as const } : drawn;
  return { kept, source, rtl, paint, ...(pin ? { pin } : {}), refusal };
}

/** The sticky place of a frozen-column cell, from its style; undefined when it is not one the canvas can pin. */
function pinOf(props: Record<string, unknown> & { style?: CSSProperties }): CanvasRunPin | undefined {
  const style = props.style;
  if (!style || style.position !== "sticky" || typeof style.zIndex !== "number") return undefined;
  const side = typeof style.left === "number" ? "left" : typeof style.right === "number" ? "right" : undefined;
  const top = typeof style.top === "number" ? style.top : undefined;
  if (!side && top === undefined) return undefined;
  if (style.top !== undefined && top === undefined) return undefined;
  return {
    ...(side ? { side, offset: style[side] as number } : {}),
    ...(top !== undefined ? { top } : {}),
    zIndex: style.zIndex,
    edge: props["data-frozen-col-edge"] === "true",
  };
}

/** The paper every frozen cell is opaque in: the pinned run's own box is, so the canvas paints no fill for it. */
const FROZEN_PAPER = "var(--spreadsheet-paper, #ffffff)";

/** A frozen cell's style without its sticky place (the run's box takes it) and its paper. */
function unpinnedStyle(style: CSSProperties | undefined): CSSProperties | undefined {
  if (!style) return style;
  const rest: CSSProperties = { ...style, position: undefined, zIndex: undefined, left: undefined, right: undefined, top: undefined };
  if (rest.backgroundColor === FROZEN_PAPER) rest.backgroundColor = undefined;
  return rest;
}

/**
 * A grid row with its resting cells on the canvas. The cells' elements are
 * already rendered (`nodes`): a pointer moving into the row, or pressing on
 * it, mounts them at once, so a press lands on a real cell.
 */
/** A press on a run: the row's cells come back, and the press lands on the cell now under it. */
function pressThrough(event: ReactPointerEvent<HTMLTableCellElement>, expand: () => void) {
  const { clientX, clientY } = event;
  const init: PointerEventInit = {
    bubbles: true, cancelable: true, composed: true, clientX, clientY, button: event.button, buttons: event.buttons,
    pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
    shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
  };
  event.preventDefault();
  event.stopPropagation();
  expand();
  document.elementFromPoint(clientX, clientY)?.dispatchEvent(new PointerEvent("pointerdown", init));
}

export function SpreadsheetCanvasRunRow({
  row,
  visualRow,
  ariaRowIndex,
  height,
  heading,
  items,
  nodes,
  frozenRow,
}: {
  row: number;
  visualRow: number;
  ariaRowIndex: number;
  height: number;
  heading: ReactNode;
  items: readonly CanvasRowItem[];
  nodes: readonly CanvasRowNode[];
  /** A frozen row: "edge" for the last one (its divider). */
  frozenRow?: "row" | "edge";
}) {
  const [expanded, setExpanded] = useState(false);
  const frozen = frozenRow ? { "data-frozen-row": "true", ...(frozenRow === "edge" ? { "data-frozen-row-edge": "true" } : {}) } : {};
  if (expanded) {
    return <tr role="row" aria-rowindex={ariaRowIndex} style={{ height }} {...frozen}>{heading}{canvasRowElements(nodes)}</tr>;
  }
  const expand = () => flushSync(() => setExpanded(true));
  return (
    <tr role="row" aria-rowindex={ariaRowIndex} data-canvas-row={visualRow} style={{ height }} {...frozen}>
      {heading}
      {items.map((item) => ("run" in item && item.pin ? (
        <td
          key={`pin:${item.run[0]}`}
          colSpan={item.run.length}
          data-canvas-pinned={item.run.join(",")}
          data-canvas-run-row={row}
          // The divider down the last frozen column (and the row's, from the
          // row): drawn over the canvas (native-page-window.css).
          data-frozen-col-edge={item.pin.edge ? "true" : undefined}
          // The frozen cells' sticky box, opaque in the sheet's paper over
          // what scrolls under it; the layer paints the cells on its canvas.
          style={{
            padding: 0, border: 0, position: "sticky", zIndex: item.pin.zIndex, backgroundColor: FROZEN_PAPER,
            ...(item.pin.side ? { [item.pin.side]: item.pin.offset } : {}),
            ...(item.pin.top !== undefined ? { top: item.pin.top } : {}),
          }}
          onPointerMove={(event) => { if (event.movementX || event.movementY) expand(); }}
          onPointerDown={(event) => pressThrough(event, expand)}
        >
          <canvas aria-hidden="true" data-canvas-pinned-canvas="" style={{ position: "absolute", pointerEvents: "none", left: 0, top: 0, width: 0, height: 0 }} />
        </td>
      ) : "run" in item ? (
        <td
          key={`run:${item.run[0]}`}
          colSpan={item.run.length}
          rowSpan={item.rowSpan}
          data-canvas-run={item.run.join(",")}
          data-canvas-run-spans={item.spans ? Object.entries(item.spans).map(([col, span]) => `${col}:${span}`).join(",") : undefined}
          data-canvas-run-row={row}
          style={{ padding: 0, border: 0 }}
          // A real move (a scroll passing under a still pointer is none) or a
          // press brings the cells back before anything reads them.
          onPointerMove={(event) => { if (event.movementX || event.movementY) expand(); }}
          onPointerDown={(event) => pressThrough(event, expand)}
        />
      ) : item.node))}
    </tr>
  );
}
