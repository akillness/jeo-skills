"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { canvasPixelsPerUnit, DESK_ZOOM_SETTLED_EVENT, LIVE_ZOOM_SETTLED_EVENT, rectScaleUnderZoom } from "@mrnote/core/web/lib/css-zoom.ts";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { clearGridCanvasTextMeasures, dropGridCanvasTextMeasuresTouched, gridCanvasNormalLineHeight, gridCanvasTextBox, paintGridCanvasText, setGridCanvasTextZoom, trackGridCanvasTextState, type GridCanvasBox, type GridCanvasText } from "../../../../lib/spreadsheet/grid-canvas-text";
import { fontLoadReach } from "@mrnote/core/web/lib/spreadsheet/font-load-reach.ts";
import { dropGridCanvasRunsTouched } from "./gridCanvasCellText";
import { conditionalIconImage } from "./conditionalIconImages";
import { DATA_BAR_BOX, dataBarFadedColor } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";

/** The canvas texts of the cells on screen, by `row:col`, with a signature of each (equal signature, equal paint). */
export class SpreadsheetGridCanvasTexts {
  readonly #texts = new Map<string, { text: GridCanvasText; signature: string }>();

  set(key: string, text: GridCanvasText | null, signature: string) {
    if (!text) {
      this.#texts.delete(key);
      return;
    }
    if (this.#texts.get(key)?.signature === signature) return;
    this.#texts.set(key, { text, signature });
  }

  get(key: string) {
    return this.#texts.get(key);
  }

  get size() {
    return this.#texts.size;
  }

  /**
   * Drops the texts of cells no longer mounted (the band moved on), once
   * they outnumber the mounted ones. A cell's text is set when the cell
   * renders; a row the band takes out and puts back without rendering it
   * again (rows mount a few a frame through their own store) still marks its
   * cells `data-canvas-text`, and dropped at once its texts were gone: the
   * rows below some line of a sheet just opened showed no text at all
   * (X-326). A text kept for a cell that renders again is replaced then.
   */
  retain(keys: ReadonlySet<string>) {
    if (this.#texts.size <= keys.size * 2 + 4096) return;
    for (const key of this.#texts.keys()) if (!keys.has(key)) this.#texts.delete(key);
  }

  clear() {
    this.#texts.clear();
  }
}

/** One of a cell's own borders, as the canvas strokes it. */
export type GridCanvasCellEdge = { width: number; style: "solid" | "dashed" | "dotted" | "double"; color: string; dash?: readonly number[] };
/** What a resting cell drawn on the canvas paints besides its text (SpreadsheetCanvasRunRow). */
export type GridCanvasCellPaint = {
  fill?: string;
  top?: GridCanvasCellEdge; right?: GridCanvasCellEdge; bottom?: GridCanvasCellEdge; left?: GridCanvasCellEdge;
  /** A gridline in a colour of the cell's own (a filled cell's: its fill), by side. */
  lines?: { right?: string; bottom?: string };
  /** Inside a selected range (not on its edge, not the active cell): the selection's tint over its fill, under its lines and text. */
  tint?: true;
  /**
   * A conditional data bar (spreadsheet-window__data-bar): its start and
   * width as shares of Excel's box in the cell's padding box (DATA_BAR_BOX);
   * a gradient to its faded colour, a 1 px border and the dashed axis as drawn.
   */
  bar?: { start: number; width: number; color: string; gradient?: "left" | "right"; border?: string; axis?: { at: number; color: string } };
  /** Background error checking's triangle (SpreadsheetErrorIndicatorMark), in the padding box's top corner on the side the sheet starts at. */
  errorMark?: "left" | "right";
  /** A note's red corner triangle (5 px), in the padding box's top corner at the cell's end. */
  noteMark?: "left" | "right";
  /**
   * A band cell's slanted band (SpreadsheetAngledBand), in its padding box's
   * frame: its fill and strokes, and how far it reaches past the cell on
   * each side (the tile takes it in).
   */
  band?: {
    corners: ReadonlyArray<readonly [number, number]>;
    fill?: string;
    strokes: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash?: readonly number[] }>;
    reachLeft: number;
    reachRight: number;
  };
  /**
   * A conditional-format icon (spreadsheet-window__cond-icon): its glyph and
   * its 16 px box at the padding box's start, `top`/`bottom` px in (null:
   * the whole height) or `height` px tall; the 15 px glyph centred in it.
   */
  icon?: { set: string; index: number; count: number; top: number | null; bottom: number | null; height: number | null };
};

/** The fills and borders of the resting cells drawn on the canvas, by `row:col`. */
export class SpreadsheetGridCanvasCells {
  readonly #paints = new Map<string, { paint: GridCanvasCellPaint; signature: string }>();
  #rowsSeen = 0;
  #rowsOnCanvas = 0;

  /** A row rendered with its resting cells on the canvas, or with its elements. */
  noteRow(onCanvas: boolean) {
    this.#rowsSeen += 1;
    if (onCanvas) this.#rowsOnCanvas += 1;
  }

  /** The share of the rows rendered since the last call that went on the canvas; null when none rendered. */
  takeRowShare(): number | null {
    const share = this.#rowsSeen > 0 ? this.#rowsOnCanvas / this.#rowsSeen : null;
    this.#rowsSeen = this.#rowsOnCanvas = 0;
    return share;
  }

  set(key: string, paint: GridCanvasCellPaint) {
    // The same paint object (a row drawn again reuses its cells' answers): nothing to compare.
    if (this.#paints.get(key)?.paint === paint) return;
    const signature = JSON.stringify(paint);
    if (this.#paints.get(key)?.signature !== signature) this.#paints.set(key, { paint, signature });
  }

  get(key: string) {
    return this.#paints.get(key);
  }

  get size() {
    return this.#paints.size;
  }

  retain(keys: ReadonlySet<string>) {
    if (this.#paints.size <= keys.size * 2 + 4096) return;
    for (const key of this.#paints.keys()) if (!keys.has(key)) this.#paints.delete(key);
  }
}









export class BackedCanvasTexts extends SpreadsheetGridCanvasTexts {
  readonly #shared: SpreadsheetGridCanvasTexts;
  readonly #backup: ReadonlyMap<string, { text: GridCanvasText; signature: string }>;

  constructor(shared: SpreadsheetGridCanvasTexts, backup: ReadonlyMap<string, { text: GridCanvasText; signature: string }>) {
    super();
    this.#shared = shared;
    this.#backup = backup;
  }

  override get(key: string) {
    return this.#shared.get(key) ?? this.#backup.get(key);
  }
}

export class BackedCanvasCells extends SpreadsheetGridCanvasCells {
  readonly #shared: SpreadsheetGridCanvasCells;
  readonly #backup: ReadonlyMap<string, { paint: GridCanvasCellPaint; signature: string }>;

  constructor(shared: SpreadsheetGridCanvasCells, backup: ReadonlyMap<string, { paint: GridCanvasCellPaint; signature: string }>) {
    super();
    this.#shared = shared;
    this.#backup = backup;
  }

  override get(key: string) {
    return this.#shared.get(key) ?? this.#backup.get(key);
  }
}

type CellBox = { left: number; top: number; width: number; height: number };

/**
 * A cell's box in table coordinates, read once per row and column: a table's
 * cells share them, a merged cell reads its own. A tile is only ever redrawn
 * from each cell's exact box, so what this asks is whether anything moved. A
 * cell's own border, which these leave out, is in its text's signature.
 */
function cellBoxReader(): (cell: HTMLTableCellElement, key: string) => CellBox {
  const columns = new Map<string, Pick<CellBox, "left" | "width">>();
  const rows = new Map<Element, Pick<CellBox, "top" | "height">>();
  return (cell, key) => {
    const row = cell.parentElement;
    if (!row || cell.rowSpan > 1 || cell.colSpan > 1) {
      return {
        left: cell.offsetLeft + cell.clientLeft,
        top: cell.offsetTop + cell.clientTop,
        width: cell.clientWidth,
        height: cell.clientHeight,
      };
    }
    const colKey = key.slice(key.indexOf(":") + 1);
    let column = columns.get(colKey);
    if (!column) columns.set(colKey, (column = { left: cell.offsetLeft + cell.clientLeft, width: cell.clientWidth }));
    let line = rows.get(row);
    if (!line) rows.set(row, (line = { top: cell.offsetTop + cell.clientTop, height: cell.clientHeight }));
    return { left: column.left, top: line.top, width: column.width, height: line.height };
  };
}

/**
 * A cell's text, clipped at its padding box as the display layer clips its
 * line. A line that fits has nothing to clip: a clip per cell was a good part
 * of repainting a band.
 */
function paintClippedText(ctx: CanvasRenderingContext2D, text: GridCanvasText, box: GridCanvasBox, devicePixels: number, originY: number) {
  // Wrapped lines are cut at the cell as the multiline layer cuts them.
  const fitsHeight = text.lines
    ? (text.paragraphHeight ?? Infinity) + text.padTop + text.padBottom <= box.height
    : (() => {
        const lineBox = text.lineHeight === "normal" ? gridCanvasNormalLineHeight(text.font) : text.lineHeight;
        return lineBox !== null && lineBox + 2 <= box.height;
      })();
  // Turned text is always cut at the cell (the angled layer's overflow: hidden).
  if (!text.turn && fitsHeight && text.width + text.padLeft + text.padRight <= box.width) {
    paintGridCanvasText(ctx, text, box, devicePixels, originY);
    return;
  }
  ctx.save();
  ctx.beginPath();
  const band = text.turn?.clip;
  if (band?.length) {
    // A band cell's text is cut at its band (the layer's clip-path).
    band.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(box.left + x, box.top + y) : ctx.lineTo(box.left + x, box.top + y)));
    ctx.closePath();
  } else ctx.rect(box.left, box.top, box.width, box.height);
  ctx.clip();
  paintGridCanvasText(ctx, text, box, devicePixels, originY);
  ctx.restore();
  // The restore put back the font set before it.
  trackGridCanvasTextState(ctx);
}

/** Rows a tile covers: tiles are cut along the mounted rows, so a band that moves keeps the tiles it still shows. */
const TILE_ROWS = 32;
/** Rows a tile of resting cells covers: such a tile paints fills, lines and text, so a band of a few rows repaints at most two. */
const RUN_TILE_ROWS = 8;

type Tile = { canvas: HTMLCanvasElement; signature: string };
type RunTile = { canvas: HTMLCanvasElement; tokens: unknown[] };

/** A run placeholder's row and columns, read from its attributes once per value. */
type RunCells = { row: string; cols: number[]; keys: string[]; spans: Map<number, number> | null };
const runCells = new WeakMap<HTMLTableCellElement, RunCells & { source: string }>();
/** `spans`: a merged anchor's column → the columns it covers with it (data-canvas-run-spans). */
function runCellsOf(run: HTMLTableCellElement): RunCells {
  const list = run.dataset.canvasRun ?? run.dataset.canvasPinned ?? "";
  const spanList = run.dataset.canvasRunSpans ?? "";
  const source = `${run.dataset.canvasRunRow}|${list}|${spanList}`;
  let known = runCells.get(run);
  if (!known || known.source !== source) {
    const row = run.dataset.canvasRunRow ?? "";
    const cols = list.split(",").map(Number);
    const spans = spanList ? new Map(spanList.split(",").map((entry) => entry.split(":").map(Number) as [number, number])) : null;
    known = { source, row, cols, keys: cols.map((col) => `${row}:${col}`), spans };
    runCells.set(run, known);
  }
  return known;
}

/**
 * The selection's tint as the grid's cells wear it (--spreadsheet-selection-tint,
 * a colour mixed with transparent), resolved to a colour a canvas takes.
 */
export function selectionTintOf(table: HTMLTableElement): string {
  const scope = table.closest<HTMLElement>(".spreadsheet-window__grid") ?? table;
  const declared = getComputedStyle(scope).getPropertyValue("--spreadsheet-selection-tint").trim();
  if (!declared || typeof document === "undefined") return "";
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;width:0;height:0;visibility:hidden;";
  probe.style.backgroundColor = declared;
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  // color(srgb r g b / a), as a colour mix resolves, as rgba for every canvas.
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/.exec(color);
  if (srgb) return `rgba(${Math.round(Number(srgb[1]) * 255)}, ${Math.round(Number(srgb[2]) * 255)}, ${Math.round(Number(srgb[3]) * 255)}, ${srgb[4] ?? 1})`;
  return color === "rgba(0, 0, 0, 0)" ? "" : color;
}

/** What each pinned run's canvas last showed. */
const pinnedTokens = new WeakMap<HTMLCanvasElement, unknown[]>();

function sameTokens(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

/**
 * A resting cell as the canvas paints it, in the canvas's frame: its border
 * box (`edge`) and text box, which of its gridlines it draws, and which of
 * its neighbours are cell elements (`dom*`, whose borders the page paints).
 */
export type CanvasCell = {
  key: string; edge: CellBox; box: CellBox; right: boolean; bottom: boolean; top?: boolean; left?: boolean;
  domTop: boolean; domLeft: boolean; domRight: boolean; domBottom: boolean;
};

/**
 * Resting cells drawn whole: fills, the gridlines no element draws, their own
 * borders, then their text. `at` is where the canvas frame's origin stands on
 * the screen (stage pixels), which lines and baselines are snapped from.
 */
export function paintCanvasCells(
  ctx: CanvasRenderingContext2D,
  list: readonly CanvasCell[],
  { devicePixels, at, gridColor, paints, texts, tint, repaint }: { devicePixels: number; at: { x: number; y: number }; gridColor: string; paints: SpreadsheetGridCanvasCells | undefined; texts: SpreadsheetGridCanvasTexts; tint: () => string; repaint: () => void },
) {
  // A border as the browser draws one: whole device pixels wide (at
  // least one), its middle on the device pixel grid of the screen.
  const deviceWidth = (width: number) => Math.max(1, Math.floor(width * devicePixels + 1e-6)) / devicePixels;
  // The browser puts a border's box [edge - w/2, edge + w/2) on the pixel
  // grid by rounding its start, after layout's 1/64 px units: rounding
  // the middle put the two borders of one row line a pixel apart where
  // the line fell on a half pixel (pass 3: R88-X14's 2 px gridlines).
  const crisp = (value: number, lineWidth: number, origin: number) => {
    const width = Math.max(1, Math.round(lineWidth * devicePixels));
    const edge = Math.round((origin + value) * devicePixels * 64) / 64;
    return (Math.round(edge - width / 2) + width / 2) / devicePixels - origin;
  };
  const stroke = (x1: number, y1: number, x2: number, y2: number, edge: GridCanvasCellEdge | { width: number; style: "solid"; color: string }) => {
    const vertical = x1 === x2;
    // A double border under 3 px is drawn as one solid line, as the browser draws it.
    const double = edge.style === "double" && edge.width * devicePixels >= 3;
    const lines = double ? [-edge.width / 3, edge.width / 3] : [0];
    const lineWidth = deviceWidth(double ? Math.max(1, edge.width / 3) : edge.width);
    ctx.strokeStyle = edge.color;
    ctx.lineWidth = lineWidth;
    const runs = "dash" in edge && edge.dash ? [...edge.dash] : null;
    ctx.setLineDash(runs ?? (edge.style === "dashed" ? [3 * lineWidth, 3 * lineWidth] : edge.style === "dotted" ? [lineWidth, lineWidth] : []));
    for (const shift of lines) {
      ctx.beginPath();
      if (vertical) {
        const x = crisp(x1 + shift, lineWidth, at.x);
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
      } else {
        const y = crisp(y1 + shift, lineWidth, at.y);
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
      }
      ctx.stroke();
    }
  };
  // Fills and gridlines, one path per colour: each cell's gridline is
  // its own right and bottom edge, so no two overlap, and a stroke per
  // edge (two per cell) was most of a tile's drawing.
  const fills = new Map<string, number[]>();
  for (const cell of list) {
    const fill = paints?.get(cell.key)?.paint.fill;
    if (!fill) continue;
    const edge = cell.edge;
    let rects = fills.get(fill);
    if (!rects) fills.set(fill, (rects = []));
    // The page paints a cell element's borders under the tiles and after
    // the backgrounds: a fill stops a device pixel short of an edge it
    // shares with one, so that border shows as it does without the
    // canvas (canvas fidelity: R87-X18's cut borders beside the cells
    // its error triangles keep).
    const pixel = 1 / devicePixels;
    const leftCut = cell.domLeft ? pixel : 0, topCut = cell.domTop ? pixel : 0;
    const rightCut = cell.domRight ? pixel : 0, bottomCut = cell.domBottom ? pixel : 0;
    rects.push(edge.left + leftCut, edge.top + topCut, Math.max(0, edge.width - leftCut - rightCut), Math.max(0, edge.height - topCut - bottomCut));
  }
  for (const [fill, rects] of fills) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let index = 0; index < rects.length; index += 4) ctx.rect(rects[index], rects[index + 1], rects[index + 2], rects[index + 3]);
    ctx.fill();
  }
  // The selection's tint inside a selected range, over the fill as the
  // cell's inset shadow lies (its padding box), under its lines and text.
  let tinted = false;
  for (const cell of list) {
    if (!paints?.get(cell.key)?.paint.tint) continue;
    if (!tinted) {
      const color = tint();
      if (!color) break;
      ctx.fillStyle = color;
      ctx.beginPath();
      tinted = true;
    }
    ctx.rect(cell.box.left, cell.box.top, cell.box.width, cell.box.height);
  }
  if (tinted) ctx.fill();
  const gridColorOf = gridColor === "rgba(0, 0, 0, 0)" ? "transparent" : gridColor || "rgba(13,148,136,0.1)";
  const gridWidth = deviceWidth(1);
  // x1, y1, x2, y2 of each gridline, by colour.
  const gridlines = new Map<string, number[]>();
  const gridlineAt = (color: string) => {
    let segments = gridlines.get(color);
    if (!segments) gridlines.set(color, (segments = []));
    return segments;
  };
  for (const cell of list) {
    const edge = cell.edge;
    const lines = paints?.get(cell.key)?.paint.lines;
    if (cell.right && (lines?.right ?? gridColorOf) !== "transparent") {
      const x = crisp(edge.left + edge.width, gridWidth, at.x);
      gridlineAt(lines?.right ?? gridColorOf).push(x, edge.top, x, edge.top + edge.height);
    }
    if (cell.bottom && (lines?.bottom ?? gridColorOf) !== "transparent") {
      const y = crisp(edge.top + edge.height, gridWidth, at.y);
      gridlineAt(lines?.bottom ?? gridColorOf).push(edge.left, y, edge.left + edge.width, y);
    }
    // A pinned cell closes its own top and left seams too, in its own edge
    // colour (the frozen cell's ::before): its box is opaque over the
    // neighbours' halves of those lines.
    if (cell.top && (lines?.bottom ?? gridColorOf) !== "transparent") {
      const y = crisp(edge.top, gridWidth, at.y);
      gridlineAt(lines?.bottom ?? gridColorOf).push(edge.left, y, edge.left + edge.width, y);
    }
    if (cell.left && (lines?.right ?? gridColorOf) !== "transparent") {
      const x = crisp(edge.left, gridWidth, at.x);
      gridlineAt(lines?.right ?? gridColorOf).push(x, edge.top, x, edge.top + edge.height);
    }
  }
  ctx.setLineDash([]);
  ctx.lineWidth = gridWidth;
  for (const [color, segments] of gridlines) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let index = 0; index < segments.length; index += 4) {
      ctx.moveTo(segments[index], segments[index + 1]);
      ctx.lineTo(segments[index + 2], segments[index + 3]);
    }
    ctx.stroke();
  }
  for (const cell of list) {
    const paint = paints?.get(cell.key)?.paint;
    if (!paint) continue;
    const edge = cell.edge;
    const x2 = edge.left + edge.width, y2 = edge.top + edge.height;
    if (paint.top) stroke(edge.left, edge.top, x2, edge.top, paint.top);
    if (paint.bottom) stroke(edge.left, y2, x2, y2, paint.bottom);
    if (paint.left) stroke(edge.left, edge.top, edge.left, y2, paint.left);
    if (paint.right) stroke(x2, edge.top, x2, y2, paint.right);
  }
  // Data bars, under the text as their layer lies.
  for (const cell of list) {
    const bar = paints?.get(cell.key)?.paint.bar;
    if (!bar) continue;
    const { box } = cell;
    // Excel's box (DATA_BAR_BOX): the bar's place and length are shares of it.
    const span = Math.max(0, box.width - 2 * DATA_BAR_BOX.side);
    const x = box.left + DATA_BAR_BOX.side + bar.start * span, width = bar.width * span;
    const y = box.top + DATA_BAR_BOX.top, height = Math.max(0, box.height - DATA_BAR_BOX.top - DATA_BAR_BOX.bottom);
    if (width > 0 && height > 0) {
      if (bar.gradient) {
        const gradient = ctx.createLinearGradient(bar.gradient === "right" ? x : x + width, 0, bar.gradient === "right" ? x + width : x, 0);
        gradient.addColorStop(0, bar.color);
        gradient.addColorStop(1, dataBarFadedColor(bar.color));
        ctx.fillStyle = gradient;
      } else ctx.fillStyle = bar.color;
      ctx.fillRect(x, y, width, height);
      if (bar.border) {
        ctx.setLineDash([]);
        ctx.strokeStyle = bar.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
      }
    }
    if (bar.axis) {
      const axisX = crisp(box.left + DATA_BAR_BOX.side + bar.axis.at * span, 1, at.x);
      ctx.strokeStyle = bar.axis.color;
      ctx.lineWidth = deviceWidth(1);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(axisX, box.top + 2);
      ctx.lineTo(axisX, box.top + box.height - 2);
      ctx.stroke();
    }
  }
  // A band cell's band: its fill and slanted edges, under its text.
  for (const cell of list) {
    const band = paints?.get(cell.key)?.paint.band;
    if (!band) continue;
    const { box } = cell;
    if (band.fill) {
      ctx.fillStyle = band.fill;
      ctx.beginPath();
      band.corners.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(box.left + x, box.top + y) : ctx.lineTo(box.left + x, box.top + y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.lineCap = "square";
    for (const stroke of band.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.setLineDash(stroke.dash ? [...stroke.dash] : []);
      ctx.beginPath();
      ctx.moveTo(box.left + stroke.x1, box.top + stroke.y1);
      ctx.lineTo(box.left + stroke.x2, box.top + stroke.y2);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
  }
  // Conditional-format icons, over the fill and bar, under the text's layer order (z-index 1).
  for (const cell of list) {
    const icon = paints?.get(cell.key)?.paint.icon;
    if (!icon) continue;
    const image = conditionalIconImage(icon.set, icon.index, icon.count, repaint);
    if (!image) continue;
    const { box } = cell;
    const top = icon.top !== null ? box.top + icon.top : icon.height !== null && icon.bottom !== null ? box.top + box.height - icon.bottom - icon.height : box.top;
    const height = icon.height ?? Math.max(0, box.height - (icon.top ?? 0) - (icon.bottom ?? 0));
    ctx.drawImage(image, box.left + 2 + 0.5, top + (height - 15) / 2, 15, 15);
  }
  ctx.setLineDash([]);
  trackGridCanvasTextState(ctx);
  for (const cell of list) {
    const entry = texts.get(cell.key);
    if (!entry) continue;
    paintClippedText(ctx, entry.text.color ? entry.text : { ...entry.text, color: "#000000" }, gridCanvasTextBox(entry.text, cell.box), devicePixels, at.y);
  }
  // Error checking's triangles, over the text as their mark lies (z-index 7).
  for (const cell of list) {
    const side = paints?.get(cell.key)?.paint.errorMark;
    if (!side) continue;
    const { box } = cell;
    const x = side === "left" ? box.left : box.left + box.width;
    const inward = side === "left" ? 6 : -6;
    ctx.fillStyle = "#107c41";
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x + inward, box.top);
    ctx.lineTo(x, box.top + 6);
    ctx.closePath();
    ctx.fill();
  }
  // Notes' red triangles, at the other corner.
  for (const cell of list) {
    const side = paints?.get(cell.key)?.paint.noteMark;
    if (!side) continue;
    const { box } = cell;
    const x = side === "left" ? box.left : box.left + box.width;
    const inward = side === "left" ? 5 : -5;
    ctx.fillStyle = "#ff0000";
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x + inward, box.top);
    ctx.lineTo(x, box.top + 5);
    ctx.closePath();
    ctx.fill();
  }
}

export type RunColumn = { edge: number; span: number; inner: number; innerWidth: number };
export type RunInset = { top: number; bottom: number; left: number; right: number };

/**
 * The columns (from their headings, in the table's frame), the body's
 * gridline colour and the cells' border insets the resting cells are drawn
 * with, read once per paint.
 */
export function readRunGeometry(table: HTMLTableElement, scale: number): { tableRect: DOMRect; columns: Map<number, RunColumn>; gridColor: string; columnToken: string; inset: RunInset | null } {
  const columns = new Map<number, RunColumn>();
  let gridColor = "";
  // Exact boxes, in the table's frame: offsetLeft/Top and offsetWidth/Height
  // are whole pixels, and on a zoomed sheet (rows of 13.3 px) the rounding
  // put the canvas rows 1-2 px off the cells and each row's top border a
  // pixel below the row above's bottom one (canvas fidelity, R88-X09 and
  // R83-X04).
  const tableRect = table.getBoundingClientRect();
  // A resting cell's text box is where a cell element's padding box would
  // be: inside its share of the collapsed borders, which a zoomed-out sheet
  // rounds up (a 1 px gridline at 50% is 2 px of layout). Read off a cell
  // the grid still mounts (the commonest of a dozen: one with a border of
  // its own reads wider); half the gridline on each side without one.
  let inset: RunInset | null = null;
  {
    const seen = new Map<string, { count: number; value: RunInset }>();
    let read = 0;
    for (const sample of table.querySelectorAll<HTMLTableCellElement>(":scope > tbody > tr > td[data-range-cell]")) {
      const value = {
        top: sample.clientTop,
        bottom: sample.offsetHeight - sample.clientHeight - sample.clientTop,
        left: sample.clientLeft,
        right: sample.offsetWidth - sample.clientWidth - sample.clientLeft,
      };
      const key = `${value.top},${value.bottom},${value.left},${value.right}`;
      const entry = seen.get(key);
      if (entry) entry.count += 1;
      else seen.set(key, { count: 1, value });
      if ((read += 1) >= 12) break;
    }
    let best = 0;
    for (const entry of seen.values()) if (entry.count > best) { best = entry.count; inset = entry.value; }
  }
  // The body's gridline colour as the cells draw it: a sheet's own gridline
  // colour, or none with View > Gridlines off. The headings keep a border
  // of their own (pass 3: R87-X25's teal lines). Read off a mounted cell
  // whose edge colour is not its own (a filled cell carries its fill there).
  let bodyGridColor = "";
  {
    let read = 0;
    for (const sample of table.querySelectorAll<HTMLTableCellElement>(":scope > tbody > tr > td[data-range-cell]")) {
      if (!sample.style.borderRightColor && !sample.style.borderColor && !sample.style.borderRight) {
        bodyGridColor = getComputedStyle(sample).borderRightColor;
        break;
      }
      if ((read += 1) >= 24) break;
    }
  }
  for (const heading of table.querySelectorAll<HTMLTableCellElement>(":scope > thead th[data-header-col]")) {
    const rect = heading.getBoundingClientRect();
    const edge = (rect.left - tableRect.left) / scale, span = rect.width / scale;
    const borderX = heading.offsetWidth - heading.clientWidth;
    columns.set(Number(heading.dataset.headerCol), inset
      ? { edge, span, inner: edge + inset.left, innerWidth: span - inset.left - inset.right }
      : { edge, span, inner: edge + borderX / 2, innerWidth: span - borderX });
    gridColor ||= getComputedStyle(heading).borderRightColor;
  }
  // View > Gridlines off: the body cells' gridlines are transparent (the
  // headings keep theirs); a filled cell still draws its fill-coloured ones.
  if (bodyGridColor) gridColor = bodyGridColor;
  if (table.dataset.hideGridlines === "true") gridColor = "transparent";
  let columnToken = "";
  for (const [col, column] of columns) columnToken += `${col}:${column.edge},${column.span},${column.inner},${column.innerWidth};`;
  if (inset) columnToken += `|${inset.top},${inset.bottom}`;
  return { tableRect, columns, gridColor, columnToken, inset };
}

/**
 * The canvas tiles over the grid table: the text of every cell marked
 * `data-canvas-text` is painted here, where the cell's display layer would
 * have drawn it. A tile is repainted only when a cell in it, its place or the
 * pixel density changed; the others stay as they were while the sheet
 * scrolls. Positioned like the table (`style`), above its cells and below
 * the overlays.
 */
export function SpreadsheetGridCanvasLayer({
  tableRef,
  texts,
  cells: cellPaints,
  style,
  zoom,
}: {
  tableRef: { readonly current: HTMLTableElement | null };
  texts: SpreadsheetGridCanvasTexts;
  /** Resting cells drawn here whole, fill and borders too (`td[data-canvas-run]`). */
  cells?: SpreadsheetGridCanvasCells;
  style: CSSProperties;
  zoom: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const tilesRef = useRef(new Map<number, Tile>());
  const runTilesRef = useRef(new Map<number, RunTile>());
  const fontsRef = useRef(0);
  useLayoutEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return;
    const reset = (event: Event) => {
      // Only a load that reaches some text measured here repaints the band
      
      // repainted it and measured its text again).
      const reach = fontLoadReach(event);
      if (reach) {
        const measures = dropGridCanvasTextMeasuresTouched(reach);
        const runs = dropGridCanvasRunsTouched(reach);
        if (!measures && !runs) return;
      } else clearGridCanvasTextMeasures();
      fontsRef.current += 1;
      for (const tile of tilesRef.current.values()) tile.signature = "";
      // Repainted now, not at the next render: fonts that land after the
      // first paint change the text's advances and the rows' heights, and
      // nothing else may render this layer for a while (X-326).
      scheduleRef.current();
    };
    fonts.addEventListener("loadingdone", reset);
    return () => fonts.removeEventListener("loadingdone", reset);
  }, []);
  // The paint below, kept current: after every render of the band, and again
  // whenever the table changes under it without a render of this layer.
  const paintRef = useRef<() => void>(() => {});
  /** An icon image the tiles waited for has arrived: every run tile and pinned canvas paints again. */
  const iconsArrivedRef = useRef(() => {
    iconEpochRef.current += 1;
    scheduleRef.current();
  });
  const iconEpochRef = useRef(0);
  const iconsArrived = iconsArrivedRef.current;
  /** A paint on the next frame (once however often asked) while the table is watched. */
  const scheduleRef = useRef<() => void>(() => {});
  /** Watches the size of every row holding canvas text and of the first such row's cells (the columns). */
  const boxesRef = useRef<{ observer: ResizeObserver; watched: Set<Element> } | null>(null);
  const watchedRef = useRef<{ table: HTMLTableElement; settle: () => void; changed: () => boolean; stop: () => void } | null>(null);
  // Forgotten as well as stopped: React also runs this when it hides the band
  // and shows it again without unmounting it (a Suspense boundary showing its
  // fallback, StrictMode's second effect run). A stopped watcher still naming
  // the same table was never rebuilt, every later paint was asked of its
  // no-op, and texts that landed after the first paint (a SUM, and the
  // formulas reading it) stayed blank until something else painted.
  useLayoutEffect(() => () => {
    watchedRef.current?.stop();
    watchedRef.current = null;
  }, []);
  // The desk's zoom changes nothing this band renders from: drawn again once it settles.
  // Nor does a live zoom's preview (a pinch scales the grid's surface): a tile
  // painted under it is drawn again once it is taken off.
  useLayoutEffect(() => {
    const again = () => paintRef.current();
    window.addEventListener(DESK_ZOOM_SETTLED_EVENT, again);
    window.addEventListener(LIVE_ZOOM_SETTLED_EVENT, again);
    return () => {
      window.removeEventListener(DESK_ZOOM_SETTLED_EVENT, again);
      window.removeEventListener(LIVE_ZOOM_SETTLED_EVENT, again);
    };
  }, []);
  function paint() {
    const host = hostRef.current;
    const table = tableRef.current;
    if (!host || !table) return;
    // What changed in the table up to here is read below: the frame the watcher
    // would ask for over the same changes drew the whole band again for nothing.
    watchedRef.current?.settle();
    const devicePixels = canvasPixelsPerUnit(table, zoom);
    // Text metrics at the sheet's zoom, as its display layers lay text out.
    setGridCanvasTextZoom(zoom);
    const cells = table.querySelectorAll<HTMLTableCellElement>(":scope > tbody > tr > td[data-canvas-text]");
    const byTile = new Map<number, Array<{ cell: HTMLTableCellElement; key: string; visualRow: number }>>();
    const mounted = new Set<string>();
    for (const cell of cells) {
      const key = cell.dataset.rangeCell;
      const visualRow = Number(cell.dataset.canvasText);
      if (!key || !Number.isFinite(visualRow)) continue;
      mounted.add(key);
      const tile = Math.floor(visualRow / TILE_ROWS);
      let list = byTile.get(tile);
      if (!list) byTile.set(tile, (list = []));
      list.push({ cell, key, visualRow });
    }
    const runs = table.querySelectorAll<HTMLTableCellElement>(":scope > tbody > tr > td[data-canvas-run]");
    const pinned = table.querySelectorAll<HTMLTableCellElement>(":scope > tbody > tr > td[data-canvas-pinned]");
    // The run cells' keys only when a store could drop anything (they keep
    // up to twice the mounted cells): a band of canvas rows holds thousands.
    let mountedCount = mounted.size;
    for (const run of runs) mountedCount += run.colSpan;
    for (const run of pinned) mountedCount += run.colSpan;
    const keep = mountedCount * 2 + 4096;
    if (texts.size > keep || (cellPaints?.size ?? 0) > keep) {
      for (const run of pinned) {
        const { row, cols } = runCellsOf(run);
        for (const col of cols) mounted.add(`${row}:${col}`);
      }
      for (const run of runs) {
        const { row, cols } = runCellsOf(run);
        for (const col of cols) mounted.add(`${row}:${col}`);
      }
      texts.retain(mounted);
      cellPaints?.retain(mounted);
    }
    // A row that grows or shrinks (AutoFit after the fonts land, a window
    // maximised) and a column that changes width move the cells under the
    // tiles without a mutation the observer below sees and, in a band of
    // fixed height, without the table changing size: the texts stayed a row
    // up or cut at their cells until something else repainted (X-326).
    const boxes = boxesRef.current;
    if (boxes) {
      const wanted = new Set<Element>();
      let firstRow: Element | null = null;
      for (const list of byTile.values()) {
        for (const { cell } of list) {
          const row = cell.parentElement;
          if (!row) continue;
          wanted.add(row);
          firstRow ??= row;
        }
      }
      if (firstRow) for (const cell of firstRow.children) wanted.add(cell);
      for (const element of boxes.watched) if (!wanted.has(element)) { boxes.observer.unobserve(element); boxes.watched.delete(element); }
      for (const element of wanted) if (!boxes.watched.has(element)) { boxes.observer.observe(element); boxes.watched.add(element); }
    }
    const tiles = tilesRef.current;
    // Where this layer sits on the screen, in the stage's (unzoomed) pixels:
    // tiles and baselines are put on the device pixel grid from it, as the
    // browser puts the cells' own text.
    let origin: { x: number; y: number } | null = null;
    // A rect under `zoom` is in screen pixels in some engines and already in
    // the element's own in WebKit, where dividing by the zoom again drew the
    // text small and in the wrong rows. The table says which; the value stays
    // the exact one, not its ratio of rounded widths.
    const scale = rectScaleUnderZoom(table, zoom);
    // Every box is read here, before any tile is written: a canvas's place or
    // size set between two reads had the next read lay the page out again.
    const geometry = runs.length || pinned.length ? readRunGeometry(table, scale) : null;
    const hostRect = host.getBoundingClientRect();
    const runRects = new Map<HTMLTableCellElement, DOMRect>();
    for (const run of runs) runRects.set(run, run.getBoundingClientRect());
    for (const run of pinned) runRects.set(run, run.getBoundingClientRect());
    let inherited: string | undefined;
    const readBox = cellBoxReader();
    for (const [index, tile] of tiles) {
      if (byTile.has(index)) continue;
      tile.canvas.remove();
      tiles.delete(index);
    }
    for (const [index, list] of byTile) {
      // The cells' padding boxes in table coordinates, one read per row and
      // column: this runs after every render and every row mounted, and each
      // cell's own reads were the largest single cost of opening a workbook
      // (235 passes over 1,150 cells, 1.4 s of 4.6 s of script).
      const boxes = list.map(({ cell, key }) => ({ key, ...readBox(cell, key) }));
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      // The scale the boxes below are measured under is part of what the tile
      // drew: drawn under a scale since corrected, the cells' table boxes the
      // same, it is drawn again (a tile painted under a pinch's preview kept
      // its text in boxes of the preview's size).
      const parts: string[] = [String(devicePixels), String(scale), String(fontsRef.current)];
      for (const box of boxes) {
        // Overflowing text reaches over its neighbours: the tile does too.
        const reach = texts.get(box.key)?.text.reach;
        left = Math.min(left, box.left - (reach?.left ?? 0));
        top = Math.min(top, box.top);
        right = Math.max(right, box.left + box.width + (reach?.right ?? 0));
        bottom = Math.max(bottom, box.top + box.height);
        parts.push(`${box.key}@${box.left},${box.top},${box.width},${box.height}#${texts.get(box.key)?.signature ?? ""}`);
      }
      // Text may reach a little past its cell's box (side bearings, descenders).
      left = Math.floor(left) - 2;
      top = Math.floor(top) - 2;
      right = Math.ceil(right) + 2;
      bottom = Math.ceil(bottom) + 2;
      const signature = `${left},${top},${right},${bottom}|${parts.join("|")}`;
      let tile = tiles.get(index);
      if (tile && tile.signature === signature) continue;
      if (!tile) {
        const canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        canvas.dataset.testid = "spreadsheet-grid-canvas-tile";
        canvas.style.position = "absolute";
        canvas.style.pointerEvents = "none";
        host.appendChild(canvas);
        tile = { canvas, signature: "" };
        tiles.set(index, tile);
      }
      tile.signature = signature;
      if (!origin) origin = { x: hostRect.left / scale, y: hostRect.top / scale };
      // The cells' padding boxes, where their display layer (absolute,
      // inset 0) would stand: rows and columns need not fall on whole
      // pixels, and a collapsed border gives each side half its width.
      const at = origin;
      const exact = list.map(({ cell, key }) => {
        const rect = cell.getBoundingClientRect();
        // client sizes are whole pixels; the borders' share is not.
        const borderX = cell.offsetWidth - cell.clientWidth;
        const borderY = cell.offsetHeight - cell.clientHeight;
        return {
          key,
          left: rect.left / scale - at.x + borderX / 2,
          top: rect.top / scale - at.y + borderY / 2,
          width: rect.width / scale - borderX,
          height: rect.height / scale - borderY,
        };
      });
      left = Math.floor((at.x + left) * devicePixels + 1e-6) / devicePixels - at.x;
      top = Math.floor((at.y + top) * devicePixels + 1e-6) / devicePixels - at.y;
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      const canvas = tile.canvas;
      const pixelWidth = Math.ceil(width * devicePixels);
      const pixelHeight = Math.ceil(height * devicePixels);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      // The bitmap's own size on the screen: a CSS size off it by a fraction of a
      // device pixel scaled the bitmap, and its one-pixel lines came out as two
      // grey ones drifting row by row (w17: R83-X04 at 75% on a 1x screen).
      canvas.style.width = `${pixelWidth / devicePixels}px`;
      canvas.style.height = `${pixelHeight / devicePixels}px`;
      canvas.dataset.tile = String(index);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      // A cell without a colour of its own draws in the colour its cell
      // gives text (the grid's cell rule), read from one such cell.
      if (inherited === undefined) {
        const plain = list.find(({ key }) => texts.get(key)?.text.color === "");
        if (plain) inherited = getComputedStyle(plain.cell).color;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(devicePixels, 0, 0, devicePixels, -left * devicePixels, -top * devicePixels);
      trackGridCanvasTextState(ctx);
      for (const box of exact) {
        const entry = texts.get(box.key);
        if (!entry) continue;
        paintClippedText(ctx, entry.text.color ? entry.text : { ...entry.text, color: inherited ?? "#000000" }, gridCanvasTextBox(entry.text, box), devicePixels, origin.y);
      }
    }
    let tint: string | null = null;
    const tintOf = () => (tint ??= selectionTintOf(table));
    origin ??= { x: hostRect.left / scale, y: hostRect.top / scale };
    paintRuns(host, runs, devicePixels, scale, origin, geometry, tintOf, runRects);
    if (pinned.length && geometry) paintPinned(pinned, devicePixels, scale, geometry, tintOf, runRects);
  }

  /**
   * The resting frozen-column cells of a canvas row (SpreadsheetCanvasRunRow's
   * pinned runs): each run is one sticky box with a canvas of its own, which
   * stays with the box as the body scrolls under it. The run's cells are
   * painted there in the box's frame, with the seams a frozen cell closes
   * itself; the dividers are the box's own (native-page-window.css).
   */
  function paintPinned(pinned: NodeListOf<HTMLTableCellElement>, devicePixels: number, scale: number, geometry: ReturnType<typeof readRunGeometry>, tintOf: () => string, rects: ReadonlyMap<HTMLTableCellElement, DOMRect>) {
    const { columns, gridColor, columnToken, inset } = geometry;
    for (const run of pinned) {
      const canvas = run.firstElementChild;
      if (!(canvas instanceof HTMLCanvasElement)) continue;
      const { cols, keys } = runCellsOf(run);
      const runColumns = cols.map((col) => columns.get(col));
      let start = Infinity;
      for (const column of runColumns) if (column) start = Math.min(start, column.edge);
      if (!Number.isFinite(start)) continue;
      const rect = rects.get(run) ?? run.getBoundingClientRect();
      const boxLeft = rect.left / scale, boxTop = rect.top / scale;
      const width = rect.width / scale, height = rect.height / scale;
      // The canvas reaches a little past the box (lines straddle its edges)
      // and stands on the device pixel grid of the screen.
      const pad = 2;
      const left = Math.floor((boxLeft - pad) * devicePixels + 1e-6) / devicePixels - boxLeft;
      const top = Math.floor((boxTop - pad) * devicePixels + 1e-6) / devicePixels - boxTop;
      const tokens: unknown[] = [devicePixels, scale, fontsRef.current, iconEpochRef.current, gridColor, columnToken, left, top, width, height];
      const list: CanvasCell[] = [];
      cols.forEach((col, position) => {
        const column = runColumns[position];
        if (!column) return;
        const key = keys[position];
        tokens.push(key, cellPaints?.get(key), texts.get(key));
        const x = column.edge - start, inner = column.inner - start;
        list.push({
          key,
          edge: { left: x, top: 0, width: column.span, height },
          box: inset
            ? { left: inner, top: inset.top, width: column.innerWidth, height: Math.max(0, height - inset.top - inset.bottom) }
            : { left: inner, top: 0.5, width: column.innerWidth, height: Math.max(0, height - 1) },
          right: true, bottom: true, top: true, left: true,
          domTop: false, domLeft: false, domRight: false, domBottom: false,
        });
      });
      const known = pinnedTokens.get(canvas);
      if (known && sameTokens(known, tokens)) continue;
      pinnedTokens.set(canvas, tokens);
      const canvasWidth = Math.max(1, width - left + pad), canvasHeight = Math.max(1, height - top + pad);
      const pixelWidth = Math.ceil(canvasWidth * devicePixels), pixelHeight = Math.ceil(canvasHeight * devicePixels);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      // The bitmap's own size on the screen: a CSS size off it by a fraction of a
      // device pixel scaled the bitmap, and its one-pixel lines came out as two
      // grey ones drifting row by row (w17: R83-X04 at 75% on a 1x screen).
      canvas.style.width = `${pixelWidth / devicePixels}px`;
      canvas.style.height = `${pixelHeight / devicePixels}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(devicePixels, 0, 0, devicePixels, -left * devicePixels, -top * devicePixels);
      paintCanvasCells(ctx, list, { devicePixels, at: { x: boxLeft, y: boxTop }, gridColor, paints: cellPaints, texts, tint: tintOf, repaint: iconsArrived });
    }
  }

  /**
   * The resting cells drawn whole (SpreadsheetCanvasRunRow): fill, the
   * gridlines no element draws, their own borders, then their text. A run's
   * row and columns are its placeholder's and the column headings' boxes.
   */
  function paintRuns(host: HTMLDivElement, runs: NodeListOf<HTMLTableCellElement>, devicePixels: number, scale: number, at: { x: number; y: number }, geometry: ReturnType<typeof readRunGeometry> | null, tintOf: () => string, rects: ReadonlyMap<HTMLTableCellElement, DOMRect>) {
    const tiles = runTilesRef.current;
    if (!runs.length) {
      for (const tile of tiles.values()) tile.canvas.remove();
      tiles.clear();
      return;
    }
    if (!geometry) return;
    const { tableRect, columns, gridColor, columnToken, inset } = geometry;
    const runCols = new Map<Element, Set<number>>();
    const runsByTile = new Map<number, HTMLTableCellElement[]>();
    for (const run of runs) {
      const line = run.parentElement as HTMLTableRowElement | null;
      if (!line) continue;
      let set = runCols.get(line);
      if (!set) runCols.set(line, (set = new Set()));
      for (const col of runCellsOf(run).cols) set.add(col);
      const tile = Math.floor(Number(line.dataset.canvasRow) / RUN_TILE_ROWS);
      let list = runsByTile.get(tile);
      if (!list) runsByTile.set(tile, (list = []));
      list.push(run);
    }
    for (const [index, tile] of tiles) {
      if (runsByTile.has(index)) continue;
      tile.canvas.remove();
      tiles.delete(index);
    }
    // `domTop`/`domLeft`/`domBottom`/`domRight`: the neighbour on that side is
    // a cell element (or the headings), whose border the page paints under
    // the tiles.
    for (const [index, tileRuns] of runsByTile) {
      // What the tile shows, as values and the stores' entries (replaced
      // only when they change): compared one by one, a band of thousands of
      // resting cells is checked without building a string per cell.
      const tokens: unknown[] = [devicePixels, scale, fontsRef.current, iconEpochRef.current, gridColor, columnToken];
      const list: CanvasCell[] = [];
      for (const run of tileRuns) {
        const line = run.parentElement as HTMLTableRowElement;
        const { cols, keys, spans } = runCellsOf(run);
        const below = line.nextElementSibling ? runCols.get(line.nextElementSibling) : undefined;
        const above = line.previousElementSibling ? runCols.get(line.previousElementSibling) : undefined;
        const lastInRow = !run.nextElementSibling;
        // A merge across rows: its bottom is the last of its rows', drawn by it.
        const tall = run.rowSpan > 1;
        // A cell element just before the run (not the row heading).
        const domBefore = Boolean(run.previousElementSibling?.hasAttribute("data-range-cell"));
        const runRect = rects.get(run) ?? run.getBoundingClientRect();
        const top = (runRect.top - tableRect.top) / scale, height = runRect.height / scale;
        tokens.push(top, height, lastInRow, !line.nextElementSibling);
        let coveredUntil = -1;
        cols.forEach((col, position) => {
          // The columns a merged anchor covers are its own box.
          if (position <= coveredUntil) return;
          const column = columns.get(col);
          if (!column) return;
          const key = keys[position];
          const span = spans?.get(col) ?? 1;
          const last = Math.min(cols.length, position + span) - 1;
          coveredUntil = last;
          // Its columns' extent, whichever way the sheet runs.
          let edgeLeft = column.edge, edgeRight = column.edge + column.span;
          let innerLeft = column.inner, innerRight = column.inner + column.innerWidth;
          let bottom = tall || !line.nextElementSibling || Boolean(below?.has(col));
          let domTop = !above?.has(col);
          for (let next = position + 1; next <= last; next += 1) {
            const more = columns.get(cols[next]);
            if (!more) continue;
            edgeLeft = Math.min(edgeLeft, more.edge);
            edgeRight = Math.max(edgeRight, more.edge + more.span);
            innerLeft = Math.min(innerLeft, more.inner);
            innerRight = Math.max(innerRight, more.inner + more.innerWidth);
            if (!tall && line.nextElementSibling && !below?.has(cols[next])) bottom = false;
            if (!above?.has(cols[next])) domTop = true;
          }
          tokens.push(key, span, bottom, cellPaints?.get(key), texts.get(key));
          const innerWidth = innerRight - innerLeft;
          list.push({
            key,
            edge: { left: edgeLeft, top, width: edgeRight - edgeLeft, height },
            box: inset
              ? { left: innerLeft, top: top + inset.top, width: innerWidth, height: Math.max(0, height - inset.top - inset.bottom) }
              : { left: innerLeft, top: top + 0.5, width: innerWidth, height: Math.max(0, height - 1) },
            right: last < cols.length - 1 || lastInRow,
            bottom,
            domTop,
            domLeft: position === 0 && domBefore,
            domRight: last === cols.length - 1 && !lastInRow,
            domBottom: !tall && Boolean(line.nextElementSibling) && !bottom,
          });
        });
      }
      let tile = tiles.get(index);
      if (tile && sameTokens(tile.tokens, tokens)) continue;
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const cell of list) {
        const reach = texts.get(cell.key)?.text.reach;
        const band = cellPaints?.get(cell.key)?.paint.band;
        left = Math.min(left, cell.edge.left - Math.max(reach?.left ?? 0, band?.reachLeft ?? 0));
        top = Math.min(top, cell.edge.top);
        right = Math.max(right, cell.edge.left + cell.edge.width + Math.max(reach?.right ?? 0, band?.reachRight ?? 0));
        bottom = Math.max(bottom, cell.edge.top + cell.edge.height);
      }
      left = Math.floor(left) - 3;
      top = Math.floor(top) - 3;
      right = Math.ceil(right) + 3;
      bottom = Math.ceil(bottom) + 3;
      if (!tile) {
        const canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        canvas.dataset.testid = "spreadsheet-grid-canvas-run-tile";
        canvas.style.position = "absolute";
        canvas.style.pointerEvents = "none";
        host.insertBefore(canvas, host.firstChild);
        tile = { canvas, tokens: [] };
        tiles.set(index, tile);
      }
      tile.tokens = tokens;
      // Table coordinates to the host's: the host stands where the table does.
      const dx = tableRect.left / scale - at.x, dy = tableRect.top / scale - at.y;
      left += dx; right += dx; top += dy; bottom += dy;
      // The tile on the device pixel grid, as the text tiles are: a tile at a
      // fractional offset is resampled and its one-pixel lines come out as
      // two grey ones.
      left = Math.floor((at.x + left) * devicePixels + 1e-6) / devicePixels - at.x;
      top = Math.floor((at.y + top) * devicePixels + 1e-6) / devicePixels - at.y;
      const width = Math.max(1, right - left), height = Math.max(1, bottom - top);
      const canvas = tile.canvas;
      const pixelWidth = Math.ceil(width * devicePixels), pixelHeight = Math.ceil(height * devicePixels);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      // The bitmap's own size on the screen: a CSS size off it by a fraction of a
      // device pixel scaled the bitmap, and its one-pixel lines came out as two
      // grey ones drifting row by row (w17: R83-X04 at 75% on a 1x screen).
      canvas.style.width = `${pixelWidth / devicePixels}px`;
      canvas.style.height = `${pixelHeight / devicePixels}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(devicePixels, 0, 0, devicePixels, -left * devicePixels, -top * devicePixels);
      const shifted = (box: CellBox) => ({ left: box.left + dx, top: box.top + dy, width: box.width, height: box.height });
      paintCanvasCells(ctx, list.map((cell) => ({ ...cell, edge: shifted(cell.edge), box: shifted(cell.box) })), { devicePixels, at, gridColor, paints: cellPaints, texts, tint: tintOf, repaint: iconsArrived });
    }
  }
  // After every render of the band: the cells are laid out, so their boxes
  // are read here (the scroll's own layout already paid for them).
  useLayoutEffect(() => {
    paintRef.current = paint;
    // A render that changed nothing in the table (the window rendering for
    // a sheet's content arriving, a panel, the ribbon) paints on the next
    // frame, before it is drawn, once however many such renders it holds:
    // painted here, each one's first box read laid out the whole page again
    // (about 1 s of the 60-chart workbook's open, 0.5 s of R116-X02's). A
    // render that changed the table (a scroll's rows, an edit's cell) paints
    // now, as before.
    const watched = watchedRef.current;
    if (watched && watched.table === tableRef.current && !watched.changed()) scheduleRef.current();
    else paint();
    // Rows mount a few a frame (grid-scroll revealGridWindowRows) through
    // their own store, a cell leaves the canvas for a spill or an editor, and
    // row heights settle after the fonts or a window resize -- none of which
    // renders this layer. The table is watched so its tiles follow: a sheet
    // just opened on a busy machine showed its texts a row or two up, cut at
    // their cells, or not at all until something else repainted (X-326).
    const table = tableRef.current;
    if (table && watchedRef.current?.table !== table) {
      watchedRef.current?.stop();
      let frame: number | null = null;
      const schedule = () => {
        if (frame !== null) return;
        frame = requestAnimationFrame(() => {
          frame = null;
          paintRef.current();
        });
      };
      const mutations = new MutationObserver(schedule);
      // The table's own data-hide-gridlines too: the canvas rows draw the
      // gridlines it hides (a probe sets it outside a render; canvas
      // fidelity passes 2-4 read it as a DOM without gridlines).
      mutations.observe(table, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-canvas-text", "data-range-cell", "data-hide-gridlines"] });
      const sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
      sizes?.observe(table);
      const rows = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
      boxesRef.current = rows ? { observer: rows, watched: new Set() } : null;
      scheduleRef.current = schedule;
      watchedRef.current = {
        table,
        settle: () => { mutations.takeRecords(); },
        // Taken: a change is painted now, and the frame it would ask for is not needed.
        changed: () => mutations.takeRecords().length > 0,
        stop: () => {
          mutations.disconnect();
          sizes?.disconnect();
          rows?.disconnect();
          boxesRef.current = null;
          scheduleRef.current = () => {};
          if (frame !== null) cancelAnimationFrame(frame);
        },
      };
    }
  });

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      data-testid="spreadsheet-grid-canvas"
      style={{ position: "absolute", height: 0, overflow: "visible", pointerEvents: "none", zIndex: 1, ...style }}
    />
  );
}
