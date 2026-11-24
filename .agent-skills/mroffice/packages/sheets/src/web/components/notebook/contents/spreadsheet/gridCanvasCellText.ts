/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties } from "react";
import { tallyCanvasProbe } from "../../../../lib/spreadsheet/cell-render-timing";
import { gridCanvasNormalLineHeight, gridCanvasTextWidth, type GridCanvasLine, type GridCanvasSegment, type GridCanvasText } from "../../../../lib/spreadsheet/grid-canvas-text";
import type { NumberFormatLayoutPart } from "@mrnote/core/web/lib/spreadsheet/number-format.ts";
import { fontMeasureStamp, spreadsheetEngineTextWidth, spreadsheetTextEngineOn } from "@mrnote/core/web/lib/spreadsheet/spreadsheet-text-engine.ts";
import { nativeTextAdvances, nativeTypographyGeneration, resolveSpreadsheetFontStyle, resolveSpreadsheetTextStyle } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import type { SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { spreadsheetNativeFontCss } from "./SpreadsheetNativeText";
import { cellTextLayerInsetY, effectiveVerticalAlign } from "./spreadsheetCellCss";
import type { FontLoadReach } from "@mrnote/core/web/lib/spreadsheet/font-load-reach.ts";

type Runs = Array<{ text: string; spacing: number }>;

/** The letter-spacing runs SpreadsheetNativeText draws `text` with. */
/** Runs and widths by text, font and resolution: a sheet shows the same few
 * strings many times over, and each mounted cell measured its own again. */
const measuredRuns = new Map<string, { runs: Runs; width: number | null }>();
const MAX_MEASURED_RUNS = 20_000;

/** The runs a font load can change, dropped (font-load-reach); true when
 * any went. */
export function dropGridCanvasRunsTouched(reach: FontLoadReach): boolean {
  let dropped = false;
  for (const key of [...measuredRuns.keys()]) {
    const fields = key.split("\u0000");
    if (reach.touchesFont(fields[3] ?? "", fields.slice(4).join("\u0000"))) {
      measuredRuns.delete(key);
      dropped = true;
    }
  }
  if (dropped) cellTextAnswers.clear();
  return dropped;
}

function measuredLine(text: string, font: string, dpi: number): { runs: Runs; width: number | null } {
  const key = `${fontMeasureStamp()}\u0000${nativeTypographyGeneration()}\u0000${dpi}\u0000${font}\u0000${text}`;
  let known = measuredRuns.get(key);
  if (!known) {
    const runs = nativeRuns(text, font, dpi);
    known = { runs, width: gridCanvasTextWidth(runs, font, "none") };
    if (measuredRuns.size >= MAX_MEASURED_RUNS) measuredRuns.clear();
    measuredRuns.set(key, known);
  }
  return known;
}

function nativeRuns(text: string, font: string, dpi: number): Runs {
  const runs: Runs = [];
  for (const run of nativeTextAdvances(text, font, dpi, 1, "paint", 0)) {
    const last = runs[runs.length - 1];
    if (last && last.spacing === run.spacing) last.text += run.text;
    else runs.push({ text: run.text, spacing: run.spacing });
  }
  return runs;
}

/** The first text a number layout draws (SpreadsheetFormattedText's font lead). */
function layoutLeadingText(parts: readonly NumberFormatLayoutPart[]): string {
  const first = parts.find((part) => part.kind !== "text" || part.text.length > 0);
  return first?.kind === "text" ? first.text : first?.kind === "fill" ? first.character : " ";
}

let reserveContext: CanvasRenderingContext2D | null | undefined;
/** A `_x` reserve's width, measured as SpreadsheetFormattedText measures it. */
function reserveWidth(character: string, font: string, dpi: number): number | null {
  const advances = nativeTextAdvances(character, font, dpi, 1, "measure");
  if (advances.every((run) => run.advance !== undefined)) return advances.reduce((sum, run) => sum + (run.advance ?? 0), 0);
  const engine = spreadsheetEngineTextWidth(character, font);
  if (engine !== undefined) return engine;
  reserveContext ??= typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!reserveContext) return null;
  reserveContext.font = font;
  return reserveContext.measureText(character).width;
}

const styleIds = new WeakMap<object, number>();
let nextStyleId = 1;

function styleIdentity(style: object | null | undefined): number {
  if (!style) return 0;
  let id = styleIds.get(style);
  if (id === undefined) styleIds.set(style, (id = nextStyleId++));
  return id;
}

/**
 * The canvas text of a cell whose display layer would draw one line of
 * native typography that fits inside the cell: plain text
 * (SpreadsheetNativeText) or a number format's layout
 * (SpreadsheetFormattedText: texts, `_x` reserves and one blank `* ` fill).
 * Null when the cell keeps its DOM display layer. The caller has ruled out
 * everything that is not such a line (rotation, scripts, accounting rules,
 * shrink, rich, wrapped and spilled text, the active and edited cell); this
 * rules out what the text, its layout and its font decide.
 */
/** A probe's tally of why a text stays with the DOM (cell-render-timing); null. */
function refused(reason: string): null {
  lastRefusal = reason;
  tallyCanvasProbe(`canvas text: ${reason}`);
  return null;
}
let lastRefusal: string | null = null;

type CellTextInput = Parameters<typeof layOutGridCanvasCellText>[0];
type CellTextAnswer = { text: GridCanvasText; signature: string } | null;

/** Whole answers by everything they read: a row drawn again (a scroll's
 * band, an edit elsewhere, a formula result) asks for the same cells, and
 * each answer resolves the font, measures its runs and builds a signature.
 * Kept per font measure stamp and typography generation; a font load that
 * drops runs (dropGridCanvasRunsTouched) drops these too. */
const cellTextAnswers = new Map<string, { answer: CellTextAnswer; refusal: string | null }>();
let cellTextAnswersStamp = "";
const MAX_CELL_TEXT_ANSWERS = 20_000;

function cellTextAnswerKey(input: CellTextInput): string {
  const { baseStyle } = input;
  const shown = input.layout
    ? input.layout.map((part) => (part.kind === "text" ? `t${part.text}` : `${part.kind === "fill" ? "f" : "r"}${part.character}`)).join("\u0002")
    : input.text;
  return [
    input.layout ? "L" : "T", shown, input.wrapped ? 1 : 0, styleIdentity(input.cellStyle), input.dpi,
    input.padLeft, input.padRight, String(input.lineHeight ?? ""), input.width, input.height,
    String(baseStyle.fontFamily ?? ""), String(baseStyle.fontSize ?? ""), String(baseStyle.fontWeight ?? ""), String(baseStyle.fontStyle ?? ""),
    String(baseStyle.color ?? ""), String(baseStyle.textAlign ?? ""), String(baseStyle.textDecorationLine ?? ""),
    String(baseStyle.WebkitTextStrokeWidth ?? ""), String(baseStyle.fontSynthesis ?? ""),
    // The browser-probed faux bold stroke (engine off): set once it is known.
    spreadsheetTextEngineOn() ? "" : fauxBoldStrokeVar(),
    input.reach ? `${input.reach.left},${input.reach.right}` : "",
    input.squeeze ?? 0,
    input.turn ? `${input.turn.x},${input.turn.y},${input.turn.rotate},${input.turn.lineHeight},${input.turn.clip?.flat().join(",") ?? ""}` : "",
    input.paragraph
      ? `${input.paragraph.safe ? 1 : 0}|${input.paragraph.height}|${input.paragraph.lines.map((line) => `${line.top},${line.height},${line.baseline ?? ""}:${line.text}`).join("\u0002")}`
      : "",
  ].join("\u0001");
}

export function gridCanvasCellText(input: CellTextInput): CellTextAnswer {
  const stamp = `${fontMeasureStamp()}\u0000${nativeTypographyGeneration()}`;
  if (stamp !== cellTextAnswersStamp) {
    cellTextAnswers.clear();
    cellTextAnswersStamp = stamp;
  }
  const key = cellTextAnswerKey(input);
  const known = cellTextAnswers.get(key);
  if (known) {
    if (known.refusal !== null) tallyCanvasProbe(`canvas text: ${known.refusal}`);
    return known.answer;
  }
  lastRefusal = null;
  const answer = layOutGridCanvasCellText(input);
  if (cellTextAnswers.size >= MAX_CELL_TEXT_ANSWERS) cellTextAnswers.clear();
  cellTextAnswers.set(key, { answer, refusal: answer === null ? lastRefusal : null });
  return answer;
}

function layOutGridCanvasCellText({
  text,
  layout,
  wrapped = false,
  baseStyle,
  cellStyle,
  dpi,
  padLeft,
  padRight,
  lineHeight,
  width,
  height,
  reach,
  paragraph,
  turn,
  squeeze = 0,
}: {
  text: string;
  /** The number format's layout the display layer draws instead of `text`. */
  layout?: readonly NumberFormatLayoutPart[];
  /** The cell wraps: a `_x` reserve is then a space, as SpreadsheetFormattedText lays it out. */
  wrapped?: boolean;
  baseStyle: CSSProperties;
  cellStyle: SpreadsheetCell["style"] | undefined;
  dpi: number;
  padLeft: number;
  padRight: number;
  /** The display layer's line height (`NNpx`), when it takes the editor's line box. */
  lineHeight: CSSProperties["lineHeight"] | undefined;
  /** The cell's width and height, px (spanned); for overflowing text, the
   * width of the box it overflows into (`reach` included). */
  width: number;
  height: number;
  /** Overflowing text: how far its box reaches past the cell's on each side, px. */
  reach?: { left: number; right: number };
  /** Wrapped text: its native paragraph's lines (one plain run each) and
   * line boxes (nativeTextParagraphWithoutLayout), the paragraph's height
   * and whether the layer's vertical alignment is `safe`. */
  paragraph?: {
    lines: ReadonlyArray<{ text: string; top: number; height: number; baseline: number | null }>;
    height: number;
    safe: boolean;
  };
  /** A number squeezed to fit (SpreadsheetNativeText `squeeze`): the letter spacing taken off every character, px (negative). */
  squeeze?: number;
  /** Angled text in the cell's own box: its turned line box (angledCellTextBox), GridCanvasText `turn`. */
  turn?: { x: number; y: number; rotate: number; lineHeight: number; clip?: ReadonlyArray<readonly [number, number]> };
}): { text: GridCanvasText; signature: string } | null {
  if (paragraph) return paragraphCanvasText(paragraph, text, baseStyle, cellStyle, dpi, padLeft, padRight);
  const shown = layout ? layout.map((part) => (part.kind === "text" ? part.text : part.character)).join("") : text;
  if (!shown) return null;
  if (/[\n\r\t]/.test(shown) || /[̀-ͯ֐-ࣿ‎‏‪-‮⁦-⁩]/u.test(shown)) return refused("breaks, marks or bidi");
  // The editor's line box (px), or none: the layer then keeps the font's own
  // line and a 2px inset above and below.
  const lineHeightPx = lineHeight === undefined
    ? "normal"
    : typeof lineHeight === "string" && /^\d+(\.\d+)?px$/.test(lineHeight) ? Number.parseFloat(lineHeight) : Number.NaN;
  if (lineHeightPx !== "normal" && (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0)) return refused("line height");
  // Decorations and faux bold strokes stay with the DOM.
  const decoration = baseStyle.textDecorationLine;
  if (decoration !== undefined && decoration !== "none") return refused("decoration");
  const leading = layout ? layoutLeadingText(layout) : text;
  const resolved = resolveSpreadsheetTextStyle(baseStyle, leading, dpi);
  if (typeof resolved.fontFamily !== "string" || typeof resolved.fontSize !== "number") return refused("font");
  // Bold in a family with no bold face: the layer's stroke, and the regular
  // face where it turns weight synthesis off. A number layout keeps the DOM.
  const faux = fauxBoldPaint(resolved);
  if (faux === "refused" || (faux && layout)) return refused("synthetic bold");
  const color = typeof baseStyle.color === "string" && baseStyle.color ? baseStyle.color : "";
  const font = spreadsheetNativeFontCss(resolved);
  const paintFont = faux?.regular ? spreadsheetNativeFontCss({ ...resolved, fontWeight: 400 }) : undefined;
  const strut = spreadsheetNativeFontCss(resolveSpreadsheetFontStyle(baseStyle));
  const room = width - padLeft - padRight - 0.5;
  let runs: Runs = [];
  let segments: GridCanvasSegment[] | undefined;
  let measured: number;
  let horizontal: GridCanvasText["horizontal"];
  const align = layout ? resolved.textAlign : baseStyle.textAlign;
  if (!layout) {
    const line = measuredLine(text, font, dpi);
    runs = squeeze ? line.runs.map((run) => ({ text: run.text, spacing: run.spacing + squeeze })) : line.runs;
    const textWidth = squeeze ? gridCanvasTextWidth(runs, font, "none") : line.width;
    if (textWidth === null) return refused("unmeasured");
    // The width as drawn: in the face its glyphs are painted in.
    measured = paintFont ? (gridCanvasTextWidth(runs, paintFont, "none") ?? textWidth) : textWidth;
    horizontal = align === "center" ? "center" : align === "right" ? "end" : "start";
  } else {
    // The layout's pieces, as its flex row lays them out: a blank fill takes
    // the room left, so what follows it ends at the text area's end.
    const fills = layout.flatMap((part) => ("character" in part && part.kind === "fill" ? [part.character] : []));
    if (fills.length > 1 || fills.some((character) => character.trim() !== "")) return refused("format fill");
    const pieces: Array<{ runs: Runs; width: number } | "fill"> = [];
    for (const part of layout) {
      if ("character" in part) {
        if (part.kind === "fill") { pieces.push("fill"); continue; }
        const reserved = wrapped ? measuredLine(" ", font, dpi).width : reserveWidth(part.character, font, dpi);
        if (reserved === null) return refused("unmeasured");
        pieces.push({ runs: [], width: reserved });
        continue;
      }
      const { runs: partRuns, width: partWidth } = measuredLine(part.text, font, dpi);
      if (partWidth === null) return refused("unmeasured");
      pieces.push({ runs: partRuns, width: partWidth });
    }
    measured = pieces.reduce((sum, piece) => sum + (piece === "fill" ? 0 : piece.width), 0);
    const fillAt = pieces.indexOf("fill");
    segments = [];
    let offset = 0;
    pieces.forEach((piece, index) => {
      if (piece === "fill") return;
      if (fillAt >= 0 && index > fillAt) {
        // Measured back from the end: the room this piece and those after it take.
        const after = pieces.slice(index).reduce((sum, rest) => sum + (rest === "fill" ? 0 : rest.width), 0);
        if (piece.runs.length) segments!.push({ runs: piece.runs, anchor: "end", offset: after });
      } else {
        if (piece.runs.length) segments!.push({ runs: piece.runs, anchor: "start", offset });
        offset += piece.width;
      }
    });
    horizontal = fillAt >= 0 ? "start" : align === "right" || align === "end" ? "end" : align === "center" ? "center" : "start";
    if (fillAt >= 0) measured = Math.max(measured, 0);
  }
  // Text wider than its cell is cut at the cell's edges, anchored as the
  // display layer anchors it (clippedCellLineAnchorCss): from the start, or
  // centred over both edges, or from the end; the tile clips a line that does
  // not fit at the cell's box. A number format's pieces keep the DOM (a
  // number too wide shows #, so this is rare).
  if (measured > room && layout) return refused("format too wide");
  const vertical = effectiveVerticalAlign(cellStyle);
  const inset = lineHeightPx === "normal" ? { top: 2, bottom: 2 } : cellTextLayerInsetY(cellStyle);
  // A number layout is a flex row in the font's own line, whatever the
  // layer's line height.
  const lineBoxHeight: number | "normal" = layout ? "normal" : lineHeightPx;
  // A line much taller than its cell (big type in a short row) keeps the
  // DOM; the ordinary overhang of a default row is painted and cut at the cell.
  const lineBox = lineBoxHeight === "normal" ? gridCanvasNormalLineHeight(font) : lineBoxHeight;
  // A turned line is cut at the cell whatever its height.
  if (lineBox === null || (!turn && lineBox > height + 4)) return refused("line too tall");
  if (turn && (layout || faux)) return refused("turned layout");
  const canvasText: GridCanvasText = {
    runs,
    ...(segments ? { segments } : {}),
    font,
    ...(strut !== font && !layout ? { strutFont: strut } : {}),
    kerning: "none",
    color,
    horizontal,
    vertical: vertical === "top" ? "top" : vertical === "middle" ? "middle" : "bottom",
    direction: "ltr",
    padTop: inset.top,
    padRight,
    padBottom: inset.bottom,
    padLeft,
    lineHeight: lineBoxHeight,
    width: measured,
    ...(paintFont ? { paintFont } : {}),
    ...(faux?.stroke ? { stroke: faux.stroke } : {}),
    ...(reach ? { reach: { left: reach.left, right: reach.right } } : {}),
    ...(turn ? { turn: { x: turn.x, y: turn.y, rotate: turn.rotate, lineHeight: turn.lineHeight, ...(turn.clip ? { clip: turn.clip } : {}) } } : {}),
  };
  const signature = [
    // A cell's border moves its padding box: a new style redraws its tile.
    styleIdentity(cellStyle),
    font, strut, color, horizontal, canvasText.vertical, padLeft, padRight, inset.top, inset.bottom, lineBoxHeight,
    paintFont ?? "", faux?.stroke ?? 0,
    reach ? `${reach.left},${reach.right}` : "",
    turn ? `${turn.x},${turn.y},${turn.rotate},${turn.lineHeight},${turn.clip?.flat().join(",") ?? ""}` : "",
    ...runs.map((run) => `${run.spacing}:${run.text}`),
    ...(segments ?? []).map((segment) => `${segment.anchor}${segment.offset}:${segment.runs.map((run) => `${run.spacing}:${run.text}`).join("|")}`),
  ].join("\u0001");
  return { text: canvasText, signature };
}

let strokeVarOfThisTask: string | null = null;
/** The faux bold stroke the browser probe sets (lib/office-fonts/faux-bold), read once a task. */
function fauxBoldStrokeVar(): string {
  if (typeof document === "undefined") return "";
  if (strokeVarOfThisTask === null) {
    strokeVarOfThisTask = getComputedStyle(document.documentElement).getPropertyValue("--office-faux-bold-stroke").trim();
    queueMicrotask(() => { strokeVarOfThisTask = null; });
  }
  return strokeVarOfThisTask;
}

/**
 * How a faux bold display layer draws its glyphs (spreadsheetFauxBoldCss):
 * the stroke, px, and whether weight synthesis is off so the regular face is
 * drawn under a bold name. Null for text that is no faux bold; "refused" for
 * a stroke or synthesis the canvas cannot repeat.
 */
function fauxBoldPaint(resolved: CSSProperties): { stroke: number; regular: boolean } | null | "refused" {
  const width = resolved.WebkitTextStrokeWidth;
  const synthesis = resolved.fontSynthesis;
  if (width === undefined && synthesis === undefined) return null;
  if (synthesis !== undefined && synthesis !== "style") return "refused";
  const fontSize = typeof resolved.fontSize === "number" ? resolved.fontSize : Number.NaN;
  const length = (value: string): number | null => {
    const match = /^(\d*\.?\d+)(em|px)$/.exec(value.trim());
    if (!match) return null;
    return match[2] === "em" ? Number(match[1]) * fontSize : Number(match[1]);
  };
  const stroke = width === undefined
    ? 0
    : typeof width === "number"
      ? width
      : String(width).startsWith("var(") ? length(fauxBoldStrokeVar() || "0px") : length(String(width));
  if (stroke === null || !Number.isFinite(stroke) || stroke < 0) return "refused";
  return { stroke, regular: synthesis === "style" };
}

/**
 * The canvas text of a wrapped cell's native paragraph, as the multiline
 * layer draws it: its lines stacked in their line boxes inside the layer's
 * insets (cellTextLayerInsetY above and below), each line a `pre` block
 * aligned by the cell's horizontal alignment.
 */
function paragraphCanvasText(
  paragraph: NonNullable<Parameters<typeof layOutGridCanvasCellText>[0]["paragraph"]>,
  text: string,
  baseStyle: CSSProperties,
  cellStyle: SpreadsheetCell["style"] | undefined,
  dpi: number,
  padLeft: number,
  padRight: number,
): { text: GridCanvasText; signature: string } | null {
  if (!paragraph.lines.length || !text) return null;
  if (/[\t]/.test(text) || /[\u0300-\u036f\u0590-\u08ff\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(text)) return refused("marks or bidi");
  const decoration = baseStyle.textDecorationLine;
  if (decoration !== undefined && decoration !== "none") return refused("decoration");
  const resolved = resolveSpreadsheetTextStyle(baseStyle, text, dpi);
  if (typeof resolved.fontFamily !== "string" || typeof resolved.fontSize !== "number") return refused("font");
  const faux = fauxBoldPaint(resolved);
  if (faux === "refused") return refused("synthetic bold");
  const font = spreadsheetNativeFontCss(resolved);
  const paintFont = faux?.regular ? spreadsheetNativeFontCss({ ...resolved, fontWeight: 400 }) : undefined;
  const color = typeof baseStyle.color === "string" && baseStyle.color ? baseStyle.color : "";
  const lines: GridCanvasLine[] = [];
  let widest = 0;
  for (const line of paragraph.lines) {
    const measured = line.text ? measuredLine(line.text, font, dpi) : { runs: [], width: 0 };
    if (measured.width === null) return refused("unmeasured");
    // The width as drawn: in the face its glyphs are painted in.
    const width = paintFont ? (gridCanvasTextWidth(measured.runs, paintFont, "none") ?? measured.width) : measured.width;
    widest = Math.max(widest, width);
    lines.push({ runs: measured.runs, width, top: line.top, height: line.height, baseline: line.baseline });
  }
  const align = baseStyle.textAlign;
  const horizontal: GridCanvasText["horizontal"] = align === "center" ? "center" : align === "right" || align === "end" ? "end" : "start";
  const vertical = effectiveVerticalAlign(cellStyle);
  const inset = cellTextLayerInsetY(cellStyle);
  const canvasText: GridCanvasText = {
    runs: [],
    lines,
    paragraphHeight: paragraph.height,
    safeVertical: paragraph.safe,
    font,
    kerning: "none",
    color,
    horizontal,
    vertical: vertical === "top" ? "top" : vertical === "middle" ? "middle" : "bottom",
    direction: "ltr",
    padTop: inset.top,
    padRight,
    padBottom: inset.bottom,
    padLeft,
    lineHeight: "normal",
    width: widest,
    ...(paintFont ? { paintFont } : {}),
    ...(faux?.stroke ? { stroke: faux.stroke } : {}),
  };
  const signature = [
    styleIdentity(cellStyle), "P", font, paintFont ?? "", faux?.stroke ?? 0, color, horizontal, canvasText.vertical, padLeft, padRight, inset.top, inset.bottom,
    paragraph.height, paragraph.safe ? 1 : 0,
    ...lines.map((line) => `${line.top},${line.height},${line.baseline ?? ""}|${line.runs.map((run) => `${run.spacing}:${run.text}`).join("|")}`),
  ].join("\u0001");
  return { text: canvasText, signature };
}
