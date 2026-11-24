"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactElement, ReactNode } from "react";
import { canvasPixelsPerUnit, rectScaleUnderZoom } from "@mrnote/core/web/lib/css-zoom.ts";
import {
  paintCanvasCells,
  readRunGeometry,
  selectionTintOf,
  type CanvasCell,
  type RunColumn,
  type RunInset,
  type SpreadsheetGridCanvasCells,
  type SpreadsheetGridCanvasTexts,
} from "./SpreadsheetGridCanvasLayer";
import type { CanvasRowItem } from "./SpreadsheetCanvasRunRow";

/**
 * The grid while a wheel or a scroll bar moves it (`?gridMotionCanvas=0`, or
 * localStorage `mrai.gridMotionCanvas` = "0", turns it off). On a Mac's Chromium
 * at a quarter of its speed, 60 wheel ticks over the 1.6 MB benchmark spent 4-5 s
 * in long frames without it and 0.15 s with it, ONLYOFFICE 0.77 s (2.9 MB: 3.4,
 * 0.5 and 2.7 s). The rows of the band stay as they are, and the rows the motion brings
 * in are drawn on canvas tiles in the stage's frame, which the compositor moves
 * with the scroll: nothing is mounted and nothing already drawn is drawn again.
 * Almost all of a scroll's long frames were React mounting the band's rows.
 * When the motion stops the rows mount a few a frame under the tiles, and each
 * tile leaves once its rows are in the table.
 */
let motionSwitch: boolean | undefined;
export function gridMotionCanvasEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (motionSwitch !== undefined) return motionSwitch;
  let asked = /[?&]gridMotionCanvas=([01])/.exec(window.location.search)?.[1] ?? null;
  if (asked === null) {
    try {
      asked = window.localStorage.getItem("mrai.gridMotionCanvas");
    } catch {
      asked = null;
    }
  }
  motionSwitch = asked !== "0";
  return motionSwitch;
}

/** How long after the last step a motion has stopped. */
export const GRID_MOTION_SETTLE_MS = 200;
/** How long after a wheel tick a scroll is that tick's motion. */
export const GRID_MOTION_ARMED_MS = 260;
/** Script a frame of motion may spend drawing; rows past it wait for the next frame. */
const FRAME_BUDGET_MS = 8;




const VISIBLE_FRAME_BUDGET_MS = 16;
const TILE_ROWS = 16;
/** Tiles kept: a screen or two either way of a fast motion. */
const MAX_TILES = 12;

export type GridMotionRowCells = {
  /** The row's cells, as the grid would put them on the canvas; null: no canvas row. */
  readonly items: readonly CanvasRowItem[] | null;
  /** The cells of a row that keeps its elements: their keys, by column. */
  readonly kept: ReadonlyArray<{ col: number; key: string }>;
};

export type GridMotionHost = {
  readonly table: HTMLTableElement;
  /** Stands at the stage's origin. */
  readonly host: HTMLElement;
  /** Stands at the stage's top, sticky along the start edge. */
  readonly headings: HTMLElement | null;
  readonly zoom: number;
  /** A drawn row's top along the stage, and its height. */
  readonly lineTop: (visualRow: number) => number;
  readonly lineSize: (visualRow: number) => number;
  /** Hidden and frozen rows are null. */
  readonly rowCells: (visualRow: number) => GridMotionRowCells | null;
  /** Whether a row's cells are in the model yet (a large tiled sheet reads its
   * rows as the motion reaches them): a row not yet in is left unpainted and
   * tried again at the next frame, rather than painted empty for good. */
  readonly ready?: (visualRow: number) => boolean;
  readonly texts: SpreadsheetGridCanvasTexts;
  readonly paints: SpreadsheetGridCanvasCells;
};

type Geometry = {
  columns: Map<number, RunColumn>;
  gridColor: string;
  inset: RunInset | null;
  devicePixels: number;
  /** The table's frame to the host's, across. */
  dx: number;
  /** `lineTop` to the host's frame, down. */
  dy: number;
  /** `lineTop` to the headings' frame, down: they stand at the stage's top, not at its origin. */
  headingDy: number;
  at: { x: number; y: number };
  left: number;
  width: number;
  tint: string;
  heading: { font: string; color: string; background: string; line: string; width: number } | null;
};

type MotionTile = {
  canvas: HTMLCanvasElement;
  heading: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D;
  headingCtx: CanvasRenderingContext2D | null;
  top: number;
  painted: Set<number>;
};

/** A row's cells in the frame the shared painter draws in (the table's, across). */
export function gridMotionCanvasCells(
  cells: GridMotionRowCells,
  row: { top: number; height: number; tallHeight?: (span: number) => number },
  columns: ReadonlyMap<number, RunColumn>,
  inset: RunInset | null,
): CanvasCell[] {
  const list: CanvasCell[] = [];
  const push = (key: string, cols: readonly number[], rowSpan: number) => {
    let edgeLeft = Infinity, edgeRight = -Infinity, innerLeft = Infinity, innerRight = -Infinity;
    for (const col of cols) {
      const column = columns.get(col);
      if (!column) continue;
      edgeLeft = Math.min(edgeLeft, column.edge);
      edgeRight = Math.max(edgeRight, column.edge + column.span);
      innerLeft = Math.min(innerLeft, column.inner);
      innerRight = Math.max(innerRight, column.inner + column.innerWidth);
    }
    if (edgeLeft === Infinity) return;
    const height = rowSpan > 1 && row.tallHeight ? row.tallHeight(rowSpan) : row.height;
    list.push({
      key,
      edge: { left: edgeLeft, top: row.top, width: edgeRight - edgeLeft, height },
      box: inset
        ? { left: innerLeft, top: row.top + inset.top, width: innerRight - innerLeft, height: Math.max(0, height - inset.top - inset.bottom) }
        : { left: innerLeft, top: row.top + 0.5, width: innerRight - innerLeft, height: Math.max(0, height - 1) },
      right: true,
      bottom: true,
      domTop: false,
      domLeft: false,
      domRight: false,
      domBottom: false,
    });
  };
  for (const item of cells.items ?? []) {
    if ("run" in item) {
      let coveredUntil = -1;
      item.run.forEach((col, position) => {
        if (position <= coveredUntil) return;
        const span = item.spans?.[col] ?? 1;
        const last = Math.min(item.run.length, position + span) - 1;
        coveredUntil = last;
        push(item.keys[position], item.run.slice(position, last + 1), item.rowSpan ?? 1);
      });
    } else {
      const element = item.node as ReactElement<{ "data-range-cell"?: string }> | null;
      const key = element?.props?.["data-range-cell"];
      if (typeof key === "string") push(key, [Number(key.split(":")[1])], 1);
    }
  }
  for (const { col, key } of cells.kept) push(key, [col], 1);
  return list;
}

/** The range cells among a row's element children. */
export function gridMotionKeptCells(children: ReactNode): Array<{ col: number; key: string }> {
  const out: Array<{ col: number; key: string }> = [];
  const visit = (node: ReactNode) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const key = (node as ReactElement<{ "data-range-cell"?: string }> | null)?.props?.["data-range-cell"];
    if (typeof key === "string") out.push({ col: Number(key.split(":")[1]), key });
  };
  visit(children);
  return out;
}

export class SpreadsheetGridMotion {
  #tiles = new Map<number, MotionTile>();
  #geometry: Geometry | null = null;
  #wanted: { first: number; last: number; direction: number } | null = null;
  #frame: number | null = null;
  #host: GridMotionHost | null = null;
  #skip: ReadonlySet<number> | null = null;
  #visible: { first: number; last: number } | null = null;

  /** Tiles stand on the screen. */
  get active(): boolean {
    return this.#tiles.size > 0;
  }

  #begin(source: GridMotionHost): Geometry | null {
    const { table, host, zoom } = source;
    const anchor = table.querySelector<HTMLElement>(":scope > tbody > tr[data-canvas-row]:not([data-frozen-row])");
    if (!anchor) return null;
    const scale = rectScaleUnderZoom(table, zoom);
    const { tableRect, columns, gridColor, inset } = readRunGeometry(table, scale);
    if (columns.size === 0) return null;
    const hostRect = host.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const dx = (tableRect.left - hostRect.left) / scale;
    const dy = (anchorRect.top - hostRect.top) / scale - source.lineTop(Number(anchor.dataset.canvasRow));
    let left = Infinity, right = -Infinity;
    for (const column of columns.values()) {
      left = Math.min(left, column.edge);
      right = Math.max(right, column.edge + column.span);
    }
    // Not a selected row's: the tiles would all wear its tint.
    const strip = source.headings?.parentElement;
    const headingCell = strip?.querySelector<HTMLElement>("th[data-grid-axis='row']:not([data-selection-header])") ??
      strip?.querySelector<HTMLElement>("th[data-grid-axis='row']") ?? null;
    let heading: Geometry["heading"] = null;
    if (headingCell) {
      const style = getComputedStyle(headingCell);
      heading = { font: style.font, color: style.color, background: style.backgroundColor, line: style.borderRightColor, width: headingCell.offsetWidth };
    }
    const headingsTop = source.headings?.getBoundingClientRect().top ?? hostRect.top;
    return {
      columns, gridColor, inset, dx, dy, heading,
      headingDy: dy + (hostRect.top - headingsTop) / scale,
      devicePixels: canvasPixelsPerUnit(table, zoom),
      at: { x: hostRect.left / scale, y: hostRect.top / scale },
      left,
      width: right - left,
      tint: selectionTintOf(table),
    };
  }

  #tile(source: GridMotionHost, geometry: Geometry, index: number): MotionTile | null {
    const known = this.#tiles.get(index);
    if (known) return known;
    if (this.#tiles.size >= MAX_TILES) {
      // The farthest from where the motion is.
      const middle = this.#wanted ? Math.floor((this.#wanted.first + this.#wanted.last) / 2 / TILE_ROWS) : index;
      let far = -1, farIndex = -1;
      for (const candidate of this.#tiles.keys()) {
        const distance = Math.abs(candidate - middle);
        if (distance > far) {
          far = distance;
          farIndex = candidate;
        }
      }
      this.#remove(farIndex);
    }
    const firstRow = index * TILE_ROWS;
    const top = source.lineTop(firstRow) + geometry.dy;
    const height = Math.max(1, source.lineTop(firstRow + TILE_ROWS) - source.lineTop(firstRow)) + 4;
    const { devicePixels } = geometry;
    const make = (width: number) => {
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.dataset.testid = "spreadsheet-grid-motion-tile";
      canvas.style.position = "absolute";
      canvas.style.pointerEvents = "none";
      canvas.width = Math.ceil(width * devicePixels);
      canvas.height = Math.ceil(height * devicePixels);
      canvas.style.width = `${canvas.width / devicePixels}px`;
      canvas.style.height = `${canvas.height / devicePixels}px`;
      canvas.style.top = `${top}px`;
      return canvas;
    };
    const canvas = make(geometry.width + 4);
    canvas.style.left = `${geometry.left + geometry.dx}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    source.host.appendChild(canvas);
    let heading: HTMLCanvasElement | null = null;
    let headingCtx: CanvasRenderingContext2D | null = null;
    if (source.headings && geometry.heading) {
      heading = make(geometry.heading.width);
      heading.style.left = "0px";
      heading.style.top = `${source.lineTop(firstRow) + geometry.headingDy}px`;
      headingCtx = heading.getContext("2d");
      source.headings.appendChild(heading);
    }
    const tile: MotionTile = { canvas, heading, ctx, headingCtx, top, painted: new Set() };
    this.#tiles.set(index, tile);
    return tile;
  }

  #remove(index: number) {
    const tile = this.#tiles.get(index);
    if (!tile) return;
    tile.canvas.remove();
    tile.heading?.remove();
    this.#tiles.delete(index);
  }

  #paintRow(source: GridMotionHost, geometry: Geometry, visualRow: number): boolean {
    if (source.ready && !source.ready(visualRow)) return false;
    const tile = this.#tile(source, geometry, Math.floor(visualRow / TILE_ROWS));
    if (!tile || tile.painted.has(visualRow)) return false;
    tile.painted.add(visualRow);
    const cells = source.rowCells(visualRow);
    if (!cells) return true;
    const height = source.lineSize(visualRow);
    const top = source.lineTop(visualRow) + geometry.dy;
    const { devicePixels, dx, at } = geometry;
    const left = geometry.left + dx;
    const list = gridMotionCanvasCells(cells, {
      top,
      height,
      tallHeight: (span) => source.lineTop(visualRow + span) - source.lineTop(visualRow),
    }, geometry.columns, geometry.inset).map((cell) => ({
      ...cell,
      edge: { ...cell.edge, left: cell.edge.left + dx },
      box: { ...cell.box, left: cell.box.left + dx },
    }));
    const { ctx } = tile;
    ctx.setTransform(devicePixels, 0, 0, devicePixels, -left * devicePixels, -tile.top * devicePixels);
    paintCanvasCells(ctx, list, {
      devicePixels, at, gridColor: geometry.gridColor, paints: source.paints, texts: source.texts,
      tint: () => geometry.tint, repaint: () => {},
    });
    if (tile.headingCtx && geometry.heading) {
      const g = tile.headingCtx;
      const { width, background, line, font, color } = geometry.heading;
      // The canvas stands on the headings' frame: within it the row is where it is within the cells' tile.
      g.setTransform(devicePixels, 0, 0, devicePixels, 0, -tile.top * devicePixels);
      g.fillStyle = background;
      g.fillRect(0, top, width, height);
      g.fillStyle = line;
      g.fillRect(0, top + height - 1, width, 1);
      g.fillRect(width - 1, top, 1, height);
      g.font = font;
      g.fillStyle = color;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(visualRow + 1), width / 2, top + height / 2);
    }
    return true;
  }

  #drain() {
    this.#frame = null;
    const wanted = this.#wanted, source = this.#host, geometry = this.#geometry;
    if (!wanted || !source || !geometry) return;
    const started = performance.now();
    const end = started + FRAME_BUDGET_MS;
    const visibleEnd = started + VISIBLE_FRAME_BUDGET_MS;
    const { first, last, direction } = wanted;
    const visible = this.#visible;
    const step = direction < 0 ? -1 : 1;
    for (let row = direction < 0 ? last : first; row >= first && row <= last; row += step) {
      if (this.#skip?.has(row)) continue;
      const onScreen = visible !== null && row >= visible.first && row <= visible.last;
      if (this.#paintRow(source, geometry, row) && performance.now() >= (onScreen ? visibleEnd : end)) {
        this.#frame = requestAnimationFrame(() => this.#drain());
        return;
      }
    }
  }

  /**
   * Draws the rows in `first..last` the table does not hold, as many as this
   * frame has room for and the rest over the next ones. False when the grid
   * cannot be drawn this way now (no canvas row to read its frame from).
   */
  show(source: GridMotionHost, first: number, last: number, direction: number, mounted: ReadonlySet<number>,
    visible: { first: number; last: number } | null = null): boolean {
    this.#host = source;
    this.#visible = visible;
    if (!this.#geometry) this.#geometry = this.#begin(source);
    if (!this.#geometry) return false;
    this.#wanted = { first, last, direction };
    this.#skip = mounted;
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#drain();
    return true;
  }

  /** Stop drawing; the tiles stand until the rows they show are mounted. */
  settle() {
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.#wanted = null;
  }

  /**
   * The rows now in the table leave their tiles at once (a cell edited from
   * here on shows through), and a tile with no row left leaves with them.
   */
  dropMounted(mounted: ReadonlySet<number>) {
    const source = this.#host, geometry = this.#geometry;
    for (const [index, tile] of this.#tiles) {
      for (const row of [...tile.painted]) {
        if (!mounted.has(row)) continue;
        tile.painted.delete(row);
        if (!source || !geometry) continue;
        const { devicePixels } = geometry;
        const top = (source.lineTop(row) + geometry.dy - tile.top) * devicePixels;
        const height = source.lineSize(row) * devicePixels;
        for (const ctx of [tile.ctx, tile.headingCtx]) {
          if (!ctx) continue;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, top - 1, ctx.canvas.width, height + 2);
        }
      }
      if (tile.painted.size === 0) this.#remove(index);
    }
    if (this.#tiles.size === 0) this.#geometry = null;
  }

  clear() {
    this.settle();
    for (const index of [...this.#tiles.keys()]) this.#remove(index);
    this.#geometry = null;
    this.#skip = null;
  }
}
