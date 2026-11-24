"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { stackPrimaryFamily } from "@mrnote/core/web/lib/office-fonts/hangul-em.ts";
import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";
import { OFFICE_SCENE_LABEL_LINE_SPACING } from "@mrnote/core/web/lib/office-smartart/model.ts";
import { OfficeTextWarpMarker } from "@mrnote/core/web/components/office-text-warp/OfficeTextWarpMarker.tsx";
import { OfficeTextShadowCopyMarker } from "@mrnote/core/web/components/office-text-warp/OfficeTextShadowCopyMarker.tsx";
import { PresentationRunsText } from "@mrnote/slides/web/components/notebook/contents/presentation/PresentationRunsText.tsx";
import { OFFICE_HIT_TEXT_ATTRIBUTE } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import { officeShapeTextFontCss } from "@mrnote/core/web/lib/office-shape-text-font.ts";
import { officeTextPaintCss } from "@mrnote/core/web/lib/office-text-paint.ts";
import { spreadsheetShapeFontStack } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { officeSymbolMarker } from "../../../../lib/spreadsheet/office-symbol-fonts";
import { cellTextRunCss, cellTextRunsInRange } from "@mrnote/core/web/lib/presentation-cell-rich-text.ts";
import type { TextRun } from "@mrnote/core/web/lib/presentation-runs.ts";
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { wordEastAsianSingleLineFactor } from "@mrnote/core/web/lib/document-word-line-metrics.ts";
import { wordFontLineMetrics, wordGridFontLineMetrics, wordGridFontVerticals } from "@mrnote/core/web/components/console/editor/native-document/wordFontMetrics.ts";
import { officeEastAsianWinLine } from "@mrnote/core/web/lib/office-fonts/office-east-asian-faces.ts";

import {
  MAX_SHAPE_TEXT_SIZE,
  MIN_SHAPE_TEXT_SIZE,
  type SpreadsheetShapeEmptyLine,
  type SpreadsheetShapeStyle,
} from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import {
  normalizeOfficeTextLayout,
  officeAnchorCenterBoundsCss,
  officeTextBodyInsetsPx,
  officeTextDefaultTabPx,
  officeTextLayoutFollowingText,
  officeTextLayoutLines,
  type OfficeTextLine,
} from "@mrnote/core/web/lib/office-text-layout.ts";
import type { PresentationCellParagraphStyle } from "@mrnote/core/web/components/notebook/contents/PresentationCellRichTextEditor.tsx";

/** The fraction of the element the preset preview's view box leaves outside. */
/**
 * A shape's words are set in Office's single line (1.2 x the size), at rest
 * and while they are typed: the body inherited the page's 1.5 lines and the
 * in-shape editor set 1.25, so a two-line label closed up the moment it was
 * opened for typing and spread again when it closed.
 */
export const SPREADSHEET_SHAPE_TEXT_LINE_HEIGHT = 1.2;
/** Windows Excel's single line of an East Asian face over its GDI ascent and descent (xlsx backlog bl8/lnex9). */
const EXCEL_EAST_ASIAN_LINE = 1.3;
/** The share of an East Asian face's ascent and descent its baseline's rise takes back from its descent. */
const EXCEL_EAST_ASIAN_RISE = 0.175;

/** CJK, kana and hangul: text Office sets on an East Asian line. */
const EAST_ASIAN_TEXT = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/u;
/** The East Asian faces of a font stack (the face a CJK character falls to). */
const EAST_ASIAN_FACE = /yahei|simsun|nsimsun|dengxian|simhei|kaiti|fangsong|mingliu|jhenghei|mincho|ms (?:p|ui )?gothic|yu gothic|meiryo|malgun|gulim|dotum|batang|gungsuh|[\u3400-\u9fff\uac00-\ud7af\u3040-\u30ff]/i;

/**
 * The workbook's Normal font where it is an East Asian face, else null: the
 * face a shape's Han and kana are drawn in when their run leaves its East
 * Asian face to the theme (`spreadsheetShapeFontStack`). Provided by the
 * sheet around its drawings.
 */
export const SpreadsheetShapeEastAsianFaceContext = createContext<string | null>(null);

/**
 * Office's single line for East Asian text in a text box, per em: Word's
 * rule, the face's box (ascender to descender) times 1.3 (SimSun 1.2933),
 * for the first East Asian face of the stack it is drawn in. Excel for Mac
 * sets 14 pt Microsoft YaHei lines 24.0 pt apart (P20: 1.714 em, the face's
 * 1.32 em box times 1.3); a fixed 1.2 drew them 16.5 pt apart. Null when the
 * stack names no East Asian face Office's metrics are known for.
 */
export function spreadsheetShapeEastAsianLine(fontStack: string): number | null {
  for (const token of fontStack.split(",")) {
    const family = token.trim().replace(/^["']|["']$/g, "");
    // Windows Excel's own: 1.3 x the face's GDI ascent and descent (xlsx
    // backlog bl8/lnex9: 游明朝 16 pt 26.88 pt apart, its Word box 1.10 em
    // would stand them 22.9).
    const windows = officeEastAsianWinLine(family);
    if (windows) return EXCEL_EAST_ASIAN_LINE * (windows.ascent + windows.descent);
    if (!EAST_ASIAN_FACE.test(family)) continue;
    const metrics = wordFontLineMetrics(family);
    if (metrics) return metrics.box * wordEastAsianSingleLineFactor(family);
  }
  return null;
}

/**
 * The East Asian line of a shape's runs that draw East Asian text in a face
 * of their own (reading row 995: a run whose `a:ea` names another face than
 * its `a:latin` is read as its script pieces, the Han and kana in the East
 * Asian face), per em, with that face: the tallest, else null. Windows Excel
 * stands a line holding them on that face's line -- 1.3 x its GDI ascent and
 * descent -- and its baseline by that face's rise (xlsx backlog bl8/lnex9:
 * Calibri with `a:ea` 游明朝 at 16 pt, "J17A漢字" lines 26.88 pt apart).
 */
export function spreadsheetShapeRunsEastAsianLine(
  runs: readonly TextRun[] | null | undefined,
): { line: number; face: string } | null {
  let best: { line: number; face: string } | null = null;
  for (const run of runs ?? []) {
    const family = run.style?.fontFamily;
    if (!family || !EAST_ASIAN_TEXT.test(run.text)) continue;
    const face = stackPrimaryFamily(family);
    const windows = officeEastAsianWinLine(face);
    if (!windows) continue;
    const line = EXCEL_EAST_ASIAN_LINE * (windows.ascent + windows.descent);
    if (!best || line > best.line) best = { line, face };
  }
  return best;
}

/**
 * A shape's single line, per em. Windows Excel steps the lines of a shape it
 * read from its file (a body reading, not SmartArt) by the face's own line --
 * its ascender less descender plus line gap: Calibri and Aptos Narrow 11 pt
 * 13.43 pt apart, Arial and Times New Roman 12.65, Verdana 13.37, Segoe UI
 * 14.63 (lookwin p98-lw), the PDF writer's lines (presentation_pdf
 * `_face_line_ems`). Office's 1.2 for any other shape (SmartArt keeps
 * Office's lines, `framed` a SmartArt label's own box) or an unknown face.
 */
export function spreadsheetShapeSingleLine(shape: SpreadsheetShapeStyle, framed = false): number {
  const face = spreadsheetShapeLineFace(shape, framed);
  if (!face) return SPREADSHEET_SHAPE_TEXT_LINE_HEIGHT;
  // An East Asian face's line is 1.3 x its GDI ascent and descent, its Latin
  // lines' too (xlsx backlog bl8/lnex9: ＭＳ Ｐゴシック 16 pt "J11A" lines
  // 20.76 pt apart, Meiryo 31.2).
  const eastAsian = officeEastAsianWinLine(face);
  if (eastAsian) return EXCEL_EAST_ASIAN_LINE * (eastAsian.ascent + eastAsian.descent);
  const metrics = wordGridFontLineMetrics(face);
  const line = metrics ? metrics.box + metrics.lineGap : NaN;
  return line >= 0.8 && line <= 3 ? line : SPREADSHEET_SHAPE_TEXT_LINE_HEIGHT;
}

/**
 * The face a shape read from Excel's file steps its lines by (its words'
 * primary face, when the body is read), else undefined: a SmartArt shape's
 * or a framed label's lines are Office's scene lines.
 */
function spreadsheetShapeLineFace(shape: SpreadsheetShapeStyle, framed = false): string | undefined {
  if (framed || shape.smartArtStyle !== undefined) return undefined;
  const face = shape.textFontFamily ? stackPrimaryFamily(shape.textFontFamily) : undefined;
  return face && normalizeOfficeTextLayout(shape.textLayout)?.bodyPr ? face : undefined;
}

/**
 * Each line's own end mark where the line is empty (`shape.textEmptyLines`,
 * reading row 989): the size and face Windows Excel stands an empty line in
 * -- its paragraph's `a:endParaRPr`, else 11 pt in the theme's body face --
 * aligned with `text`'s lines; null when the label has none to draw (words
 * typed since into another count of lines, or no empty line left).
 */
export function spreadsheetShapeEmptyLines(
  shape: SpreadsheetShapeStyle,
  text: string,
): (SpreadsheetShapeEmptyLine | null)[] | null {
  const stated = shape.textEmptyLines;
  if (!stated?.length) return null;
  const lines = text.split("\n");
  if (lines.length !== stated.length) return null;
  const drawn = stated.map((entry, index) => (entry && lines[index] === "" ? entry : null));
  return drawn.some((entry) => entry !== null) ? drawn : null;
}

/**
 * Each paragraph's end mark on its last line (`shape.textLineMarks`, reading
 * row 997), aligned with `text`'s lines: the East Asian Office face's line
 * (per em) and the baseline's rise, per em, Windows Excel holds a last line
 * of East Asian text on where it is taller than the words' own (xlsx backlog
 * bl10/lnmk: Han in a 游明朝 run's HG face, 18 pt, the last line 30.12 pt
 * where the others are 23.4). Null when the label has none to draw.
 */
export function spreadsheetShapeLineMarks(
  shape: SpreadsheetShapeStyle,
  text: string,
): ({ line: number; rise: number } | null)[] | null {
  const stated = shape.textLineMarks;
  if (!stated?.length) return null;
  const lines = text.split("\n");
  if (lines.length !== stated.length) return null;
  const drawn = stated.map((entry, index) => {
    const windows = entry && EAST_ASIAN_TEXT.test(lines[index] ?? "") ? officeEastAsianWinLine(entry.fontFamily) : undefined;
    if (!windows) return null;
    const sum = windows.ascent + windows.descent;
    return { line: EXCEL_EAST_ASIAN_LINE * sum, rise: windows.descent - 0.175 * sum };
  });
  return drawn.some((entry) => entry !== null) ? drawn : null;
}

/**
 * The single line, per em, an empty line stands in its own face: the face's
 * line where the shape steps by faces (`spreadsheetShapeSingleLine`), else
 * the label's.
 */
function spreadsheetEmptyLineSingle(shape: SpreadsheetShapeStyle, face: string | undefined, single: number): number {
  if (!face || !normalizeOfficeTextLayout(shape.textLayout)?.bodyPr || shape.smartArtStyle !== undefined) return single;
  const metrics = wordGridFontLineMetrics(face);
  const line = metrics ? metrics.box + metrics.lineGap : NaN;
  return line >= 0.8 && line <= 3 ? line : single;
}

/**
 * The paint the body draws a shape's words in and the in-shape editor types
 * them in: the frame's own insets, its wrap, the line box and the label's
 * WordArt look (the preset styles and the shared text paint). One answer for
 * both, so opening the words for typing changes none of it.
 */
export function spreadsheetShapeTextPaintCss(
  shape: SpreadsheetShapeStyle,
  /** The words lie in a SmartArt label's own box (`smartArtTextBox`): Office's
   * text area with its insets already taken off, so no padding of its own. */
  framed = false,
): CSSProperties {
  const layout = normalizeOfficeTextLayout(shape.textLayout);
  const body = layout?.bodyPr;
  const insets = body ? officeTextBodyInsetsPx(body) : null;
  return {
    // A tab moves to the next whole multiple of the paragraph's default tab
    // interval (`a:pPr@defTabSz`, Office's inch when unstated), measured from
    // the text area's edge, as Excel draws a label with no custom stops; the
    
    tabSize: `${officeTextDefaultTabPx(layout)}px`,
    // East Asian vertical and Stacked text, set in columns inside the box:
    // on the flex box the anchor then runs across the columns and the
    // alignment along them, as a:bodyPr's do for vertical text (R2-X06).
    ...(body?.vert === "eaVert"
      ? { writingMode: "vertical-rl" as const, textOrientation: "mixed" as const }
      : body?.vert === "wordArtVertRtl"
        ? { writingMode: "vertical-rl" as const, textOrientation: "upright" as const }
        : body?.vert === "wordArtVert"
          ? { writingMode: "vertical-lr" as const, textOrientation: "upright" as const }
          : {}),
    // `a:bodyPr`'s four insets where the package states them; otherwise the
    // values the SDK's BodyProperties page says an absent attribute implies
    // (lIns/rIns 91440 EMU = 0.1in, tIns/bIns 45720 = 0.05in). The inset and
    // `a:pPr@marL` are ADDITIVE, so the line's own margin is drawn INSIDE
    // this padding.
    padding: insets
      ? `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`
      : framed
        ? 0
        : "4.8px 9.6px",
    // `a:bodyPr@wrap="none"` is a label that does not wrap at the shape's
    // edge. Every label keeps the white space typed into it, as Excel draws
    // it: a plain shape's tab and line break collapsed to a space at rest,
    // though its editor showed them.
    whiteSpace: body?.wrap === "none" ? "pre" : "pre-wrap",
    // A word longer than the line is broken where the line ends, as Office
    // breaks it (K30_DuplicateImageNames: "Economi" in a narrow box, the
    // rest clipped; X-124), never run past the box's edge.
    // A SmartArt shape's words (its own text box, `framed`) break anywhere:
    // the box is laid out at the words' widest, so `break-word`, which does
    // not narrow that, let a word set by hand at 28 pt run out of both sides
    // where Excel breaks it ("gamm" / "a", SmartArt probe X24ui).
    ...(body?.wrap === "none" ? {} : { overflowWrap: framed ? ("anywhere" as const) : ("break-word" as const) }),
    // A SmartArt shape's words stand at Office's SmartArt spacing, 90 % of
    // the single line, as the engine fitted them: drawn at the full single
    // line, a label wrapped to two lines ran out under its box where Excel
    // draws both (SmartArt probe X24ui, 28 pt Georgia "gamm" / "a").
    // A shape read from Excel's file steps by its face's own line
    // (`spreadsheetShapeSingleLine`).
    lineHeight:
      framed || shape.smartArtStyle !== undefined
        ? SPREADSHEET_SHAPE_TEXT_LINE_HEIGHT * OFFICE_SCENE_LABEL_LINE_SPACING
        : spreadsheetShapeSingleLine(shape),
    // Font > Character Spacing (`a:rPr@spc`, points): the space Office adds
    // after each character (X-162).
    ...(shape.textCharacterSpacing ? { letterSpacing: `${ptToPx(shape.textCharacterSpacing)}px` } : {}),
    ...(shape.textArt === "outlined"
      ? {
          WebkitTextStrokeWidth: "1px",
          WebkitTextStrokeColor: shape.textColor ?? "#111827",
          color: "transparent",
        }
      : {}),
    ...(shape.textArt === "shadowed"
      ? { textShadow: "2px 2px 3px rgba(0,0,0,0.35)" }
      : {}),
    ...(shape.textArt === "gradient"
      ? {
          backgroundImage: `linear-gradient(180deg, ${
            shape.textColor ?? "#0d9488"
          }, #111827)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }
      : {}),
    // The shared WordArt paint (the OfficeTextPaint Docs and the deck keep)
    // draws over the older preset paint above.
    ...(shape.textPaint ? officeTextPaintCss(shape.textPaint) : {}),
  };
}

/**
 * Each paragraph's own font size, CSS px: the largest its runs state, where
 * every run of the paragraph states one (else undefined: the label's size).
 * Excel steps a paragraph's lines by its own text's size; a paragraph block
 * left at the label's size stands every line of smaller runs on the label's
 * taller line box (R452-X59's notes: 10 pt paragraphs in a 12 pt label drew
 * 15.9 pt apart where Windows Excel's stand 13.2, 40 pt down a page).
 * For the label's own words, or words typed over them in as many paragraphs;
 * null otherwise.
 */
function shapeParagraphRunSizes(shape: SpreadsheetShapeStyle, text: string): (number | undefined)[] | null {
  const own = shape.text ?? "";
  const runs = runsSpelling(shape.textRuns, own);
  if (!runs) return null;
  const sizes: (number | undefined)[] = [];
  let start = 0;
  for (const paragraph of own.split("\n")) {
    const end = start + paragraph.length;
    const stated = cellTextRunsInRange(runs, { start, end }).map((run) => run.style?.fontSize);
    sizes.push(stated.length > 0 && stated.every((size): size is number => typeof size === "number" && size > 0)
      ? Math.max(...(stated as number[]))
      : undefined);
    start = end + 1;
  }
  return text === own || text.split("\n").length === sizes.length ? sizes : null;
}

/**
 * Whether a label draws lines one flow cannot: a marker, a margin or a
 * line's own alignment (a package's bullets and paragraphs).
 */
export function spreadsheetShapeTextDrawsLayout(shape: SpreadsheetShapeStyle): boolean {
  const layout = normalizeOfficeTextLayout(shape.textLayout);
  if (!layout) return false;
  return officeTextLayoutLines(shape.text ?? "", layout).some(
    (line) => line.marker !== null || line.marginPx !== 0 || Boolean(line.align) || lineSpaced(line),
  );
}

/**
 * The paragraphs a label laid out in lines (bullets, numbers, margins, a
 * line's own alignment) is TYPED in: the shared shape text field
 * (`OfficeShapeTextField`, the deck's rich text field) draws each paragraph
 * with the marker, margin, hanging indent and alignment the body draws it
 * with at rest, for the words as typed (a paragraph split by Enter keeps its
 * bullet in both halves). So the words are typed where they are drawn, and an
 * equation, a run's own format and a paste are the field's, as in any other
 * shape. Undefined for a label drawn as one flow.
 */
export function spreadsheetShapeEditorParagraphs(
  shape: SpreadsheetShapeStyle,
  text: string,
  textBox: boolean,
): PresentationCellParagraphStyle[] | undefined {
  if (!spreadsheetShapeTextDrawsLayout(shape)) return undefined;
  const layout = officeTextLayoutFollowingText(
    normalizeOfficeTextLayout(shape.textLayout),
    shape.text ?? "",
    text,
  );
  const ownAlign = shapeOwnAlign(shape);
  const fontSize = shapeTextSize(shape);
  const runSizes = shapeParagraphRunSizes(shape, text);
  return officeTextLayoutLines(text, layout).map((line, index) => {
    const css = shapeTextLineCss(
      line,
      ownAlign ?? (textBox ? "left" : "center"),
      ownAlign,
      runSizes?.[index] ?? fontSize,
      spreadsheetShapeSingleLine(shape),
      spreadsheetShapeLineFace(shape),
    );
    if (runSizes?.[index] !== undefined && runSizes[index] !== fontSize) css.block.fontSize = `${runSizes[index]}px`;
    return {
      block: css.block,
      ...(line.marker !== null ? { marker: { text: shapeLineMarkerText(line), css: css.marker } } : {}),
    };
  });
}

function shapeOwnAlign(shape: SpreadsheetShapeStyle): "left" | "center" | "right" | "justify" | undefined {
  return shape.textAlign === "left" || shape.textAlign === "center" || shape.textAlign === "right"
    ? shape.textAlign
    : shape.textAlign === "justify"
      ? "justify"
      : undefined;
}

function shapeTextSize(shape: SpreadsheetShapeStyle): number {
  return Math.min(MAX_SHAPE_TEXT_SIZE, Math.max(MIN_SHAPE_TEXT_SIZE, shape.textSize ?? 12));
}

export interface ShapeTextInset {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The words of `runs` each in its own format (`textRuns`): drawn by the
 * deck's own run renderer (`PresentationRunsText`: an equation run as its
 * math atom, a trailing line break as a line), each run's CSS the sheet's --
 * the run's field over the label's (`base`, the label's font CSS), the run's
 * face in the sheet's font stack, and a run's own WordArt drawn over the
 * label's (the shared run CSS a slide table cell and a Docs shape draw with).
 */
function spreadsheetShapeRunSpans(
  runs: readonly TextRun[],
  base: CSSProperties,
  key: string,
  eastAsianFace: string | null,
): ReactNode {
  const text = runs.map((run) => run.text).join("");
  // The deck's run renderer keeps a run's stated bold / italic only when on,
  // so a run stated off would wear the label's: where every run states its
  // own, the label's is no run's (R467-X69: a text box whose first run alone
  // is bold, its label marked bold for it, drew every paragraph bold).
  const statesAll = (flag: "bold" | "italic") =>
    runs.every((run) => run.style !== undefined && Object.prototype.hasOwnProperty.call(run.style, flag));
  const runBase: CSSProperties = {
    ...base,
    ...(statesAll("bold") && Number(base.fontWeight) >= 600 ? { fontWeight: 400 } : {}),
    ...(statesAll("italic") && base.fontStyle === "italic" ? { fontStyle: "normal" } : {}),
  };
  return (
    <span key={key} data-spreadsheet-shape-run="">
      <PresentationRunsText
        text={text}
        runs={runs}
        runCss={(style) => {
          const css = cellTextRunCss(style, runBase);
          if (style?.fontFamily) css.fontFamily = spreadsheetShapeFontStack(style.fontFamily, eastAsianFace);
          return css;
        }}
      />
    </span>
  );
}

/** The runs spelling `text` exactly, else none (a draft typed past them). */
function runsSpelling(runs: readonly TextRun[] | undefined, text: string): readonly TextRun[] | null {
  if (!runs?.length) return null;
  return runs.map((run) => run.text).join("") === text ? runs : null;
}

/**
 * A sheet shape's own label: the characters, and the LAYOUT the package states
 * for them.
 *
 * Before this, a shape's words were one string drawn in a flex box with a flat
 * padding and a render-side anchor, so a numbered list came out as bare lines
 * at the wrong depth in the wrong place. The layout now comes from the file:
 *
 * * each line's marker and running number from the ONE renderer every host
 *   draws lists with (`office-text-layout` -> `renderParagraphs`), including
 *   the `startAt` restart rule measured against real PowerPoint (§40.2) and
 *   the level-sensitive counters Microsoft documents on `a:buAutoNum`;
 * * `a:pPr@marL` as the line's left margin and `@indent` as its first-line
 *   offset, which is exactly what CSS `margin-inline-start` + `text-indent`
 *   express, so a hanging marker sits in its own gutter;
 * * `a:bodyPr`'s `anchor` and four insets, where the package states them.
 *
 * Nothing here is authoritative for the characters: the label is still
 * `shape.text`, and a receipt that no longer describes these lines is ignored
 * (SHAPE-IMPORT-AUDIT.md §44).
 */
export function SpreadsheetShapeTextBody({
  shape,
  textBox,
  inset,
  hitText = false,
  framed = false,
}: {
  shape: SpreadsheetShapeStyle;
  /** An Excel text box draws top-left; every other shape centres its label. */
  textBox: boolean;
  inset: ShapeTextInset;
  /** The words lie in a SmartArt label's own box, its insets already off (`spreadsheetShapeTextPaintCss`). */
  framed?: boolean;
  /**
   * The shape is hit by its geometry (`officeDrawingSelectionStyles.geometryHit`
   * on the host): its words take presses as words, so a press on them selects
   * the shape. Words with no characters are no words and block nothing.
   */
  hitText?: boolean;
}) {
  const text = shape.text ?? "";
  const layout = useMemo(
    () => normalizeOfficeTextLayout(shape.textLayout),
    [shape.textLayout],
  );
  const lines = useMemo(
    () => officeTextLayoutLines(text, layout),
    [text, layout],
  );
  // East Asian text takes Office's East Asian line, read off the face the
  // body is drawn in (inherited from the drawing's own stack).
  const bodyRef = useRef<HTMLSpanElement | null>(null);
  const eastAsianFace = useContext(SpreadsheetShapeEastAsianFaceContext);
  const eastAsian = EAST_ASIAN_TEXT.test(text);
  const [eastAsianLine, setEastAsianLine] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = bodyRef.current;
    const stack = eastAsian && node ? spreadsheetShapeEastAsianLine(getComputedStyle(node).fontFamily) : null;
    // A run's own East Asian face's line, where it is taller (reading row 995).
    const own = eastAsian ? spreadsheetShapeRunsEastAsianLine(runsSpelling(shape.textRuns, text)) : null;
    const next = own && own.line > (stack ?? 0) ? own.line : stack;
    setEastAsianLine((current) => (current === next ? current : next));
  }, [eastAsian, text, shape.textFontFamily, shape.textRuns, eastAsianFace]);
  // A clipped body (`a:bodyPr@vertOverflow` clip / ellipsis) as Windows
  // Excel draws it: the lines whose foot falls inside the text area, the
  // next one left out whole rather than cut (lookwin p101-lw), anchored as
  // the body. Measured off the drawn body: its whole lines' height, for a
  // body of one size and one line pitch.
  const clipsWholeLines =
    (layout?.bodyPr?.vertOverflow === "clip" || layout?.bodyPr?.vertOverflow === "ellipsis") &&
    !framed &&
    shape.smartArtStyle === undefined &&
    !eastAsian &&
    layout?.bodyPr?.vert === undefined &&
    !shape.textRuns?.some((run) => run.style?.fontSize !== undefined) &&
    !lines.some(lineSpaced);
  const [keptHeight, setKeptHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = bodyRef.current;
    let next: number | null = null;
    if (clipsWholeLines && node) {
      const style = getComputedStyle(node);
      const inner = node.clientHeight - (Number.parseFloat(style.paddingTop) || 0) - (Number.parseFloat(style.paddingBottom) || 0);
      const pitch = spreadsheetShapeSingleLine(shape) * shapeTextSize(shape);
      const kept = pitch > 0 && inner > 0 ? Math.floor((inner + 0.01) / pitch) * pitch : 0;
      next = kept >= pitch ? kept : null;
    }
    setKeptHeight((current) => (current === next ? current : next));
  }, [clipsWholeLines, shape, inset, text]);
  if (!text) return null;
  // Each run wears its own format.
  const runs = runsSpelling(shape.textRuns, text);
  const wordsHit = hitText && text.trim() !== "";
  const body = layout?.bodyPr;
  // A stated anchor is the file's; with none, the host keeps drawing what it
  // drew before this receipt existed.
  // Home ▸ Alignment on the selected shape (its own `textVerticalAlign` /
  // `textAlign`) wins over the file's receipt and the host's default.
  const anchor =
    shape.textVerticalAlign === "top"
      ? "t"
      : shape.textVerticalAlign === "middle"
        ? "ctr"
        : shape.textVerticalAlign === "bottom"
          ? "b"
          : body?.anchor;
  const ownAlign = shapeOwnAlign(shape);
  const alignItems =
    anchor === "ctr"
      ? "center"
      : anchor === "b"
        ? "flex-end"
        : anchor === "t"
          ? "flex-start"
          : textBox
            ? "flex-start"
            : "center";
  // `a:bodyPr@anchorCtr` ("Middle Centered"): the text's own bounds box is
  // centred across the frame and the lines align inside it. The bare-text
  // path is one anonymous flex item that already shrinks to its longest
  // line, so centring the row centres that box.
  const anchorCtr = body?.anchorCtr === true;
  // An empty line standing in its own end mark is drawn as a line of its
  // own (reading row 989), as a laid-out label's lines are.
  const emptyLines = spreadsheetShapeEmptyLines(shape, text);
  // A paragraph's last line holding its end mark (reading row 997).
  const lineMarks = !framed && shape.smartArtStyle === undefined ? spreadsheetShapeLineMarks(shape, text) : null;
  const drawsLayout = emptyLines !== null || lineMarks !== null || lines.some(
    (line) => line.marker !== null || line.marginPx !== 0 || line.align || lineSpaced(line),
  );
  const fontSize = shapeTextSize(shape);
  const single = spreadsheetShapeSingleLine(shape, framed);
  const lineFace = spreadsheetShapeLineFace(shape, framed);
  // The face whose line and rise a line of East Asian text stands on when a
  // run draws that text in its own East Asian face (reading row 995).
  const runsEastAsian = !framed && shape.smartArtStyle === undefined && lineFace
    ? spreadsheetShapeRunsEastAsianLine(runs)
    : null;
  const font = officeShapeTextFontCss(shape, {
    familyStack: (family) => spreadsheetShapeFontStack(family, eastAsianFace),
    boldByDefault: Boolean(shape.textArt),
  });
  // A label of runs draws each run's underline / strikethrough on the run: a
  // line drawn by the label would cross a run stated without one.
  const labelFont: CSSProperties = runs
    ? { ...font, textDecorationLine: undefined, textDecorationStyle: undefined }
    : font;
  // Each line's own runs, where the label draws its lines.
  const lineRuns = runs
    ? (() => {
        let start = 0;
        return lines.map((line) => {
          const end = start + line.text.length;
          const slice = text.slice(start, end) === line.text
            ? cellTextRunsInRange(runs, { start, end })
            : null;
          start = end + 1;
          return slice;
        });
      })()
    : null;
  const paragraphRunSizes = drawsLayout ? shapeParagraphRunSizes(shape, text) : null;
  const content: ReactNode = drawsLayout ? (
      <span
        data-spreadsheet-shape-text="layout"
        style={{
          display: "block",
          width: "100%",
          ...officeAnchorCenterBoundsCss(anchorCtr),
        }}
      >
        {lines.map((line, index) => (
          <ShapeTextLine
            key={index}
            line={line}
            eastAsianLine={eastAsianLine ? (EAST_ASIAN_TEXT.test(line.text) ? eastAsianLine : 0) : null}
            fallbackAlign={ownAlign ?? (textBox ? "left" : "center")}
            ownAlign={ownAlign}
            fontSize={fontSize}
            runSize={emptyLines?.[index]?.size ?? paragraphRunSizes?.[index]}
            mark={lines.length === lineMarks?.length ? lineMarks?.[index] ?? undefined : undefined}
            single={
              runsEastAsian && eastAsianLine === runsEastAsian.line && EAST_ASIAN_TEXT.test(line.text)
                ? Math.max(single, runsEastAsian.line)
                : single
            }
            face={
              runsEastAsian && eastAsianLine === runsEastAsian.line && EAST_ASIAN_TEXT.test(line.text)
                ? runsEastAsian.face
                : lineFace
            }
            emptyFace={
              emptyLines?.[index]?.fontFamily
                ? {
                    stack: spreadsheetShapeFontStack(emptyLines[index]!.fontFamily!, eastAsianFace),
                    single: spreadsheetEmptyLineSingle(shape, emptyLines[index]!.fontFamily, single),
                  }
                : undefined
            }
            words={
              lineRuns?.[index]?.length
                ? spreadsheetShapeRunSpans(lineRuns[index]!, font, `line${index}`, eastAsianFace)
                : undefined
            }
          />
        ))}
      </span>
    ) : runs ? (
      <span data-spreadsheet-shape-text="runs">{spreadsheetShapeRunSpans(runs, font, "runs", eastAsianFace)}</span>
    ) : wordsHit ? (
      // Hit where the words are (the shared geometry-hit rule passes the
      // body's own box through): bare text needs an element to be hit.
      <span>{text}</span>
    ) : (
      text
    );
  return (
    <span
      style={{
        position: "absolute",
        // The shape's OWN box, not the element's: the preset preview draws
        // into a view box that bleeds outside the shape so a callout's leader
        // is not clipped, which leaves the outline inset inside the element.
        // Filling the element instead put a text box's words above and to the
        // LEFT of its own border (measured in a real browser; §41).
        left: `${inset.left * 100}%`,
        top: `${inset.top * 100}%`,
        right: `${inset.right * 100}%`,
        bottom: `${inset.bottom * 100}%`,
        display: "flex",
        alignItems,
        justifyContent:
          ownAlign === "left"
            ? "flex-start"
            : ownAlign === "right"
              ? "flex-end"
              : ownAlign
                ? "center"
                : textBox && !anchorCtr
                  ? "flex-start"
                  : "center",
        textAlign: ownAlign ?? (textBox ? "left" : "center"),
        fontSize,
        // Excel draws a run at the weight, slant, decoration and face the run
        // states (`a:rPr@b/@i/@u/@strike`, `a:latin`); a whole-shape font is
        // one value per property, set from Home > Font. WordArt draws bold
        // unless the author turned it off; an inherited weight would bold
        // every label.
        ...labelFont,
        // A run that states no colour, in a shape without a style, is
        // DrawingML's default text colour, black (tx1); inherited, it took
        // the app's ink (#0f2f2c) -- PH180's LibreOffice text box (X-286).
        color: shape.textColor ?? "#000000",
        // A geometry-hit host's words are hit as words: the shared rule lifts
        // them (an inline value would beat it); any other label is drawn
        // over its shape and never takes the press.
        ...(wordsHit ? {} : { pointerEvents: "none" as const }),
        // Excel's "Allow text to overflow shape" is `a:bodyPr@vertOverflow`,
        // whose schema default is `overflow`: a file that states the body
        // draws its words past the shape unless it says `clip`/`ellipsis`.
        // A shape with no body reading keeps the clipped label it always drew.
        // A SmartArt shape's words always have the body reading's default:
        // a label longer than its shape spills above and below it, centred,
        
        overflow:
          (body || framed || shape.smartArtStyle !== undefined) &&
          body?.vertOverflow !== "clip" &&
          body?.vertOverflow !== "ellipsis"
            ? "visible"
            : "hidden",
        ...(body?.vertOverflow === "ellipsis" ? { textOverflow: "ellipsis" } : {}),
        // Insets, wrap, line box and WordArt look: the in-shape editor's too.
        ...spreadsheetShapeTextPaintCss(shape, framed),
        ...(eastAsianLine ? { lineHeight: Math.max(single, eastAsianLine) } : {}),
      }}
      data-spreadsheet-shape-text-body=""
      ref={bodyRef}
      {...(wordsHit ? { [OFFICE_HIT_TEXT_ATTRIBUTE]: "" } : {})}
      data-text-art={shape.textArt ?? undefined}
      data-text-paint={shape.textPaint ? "true" : undefined}
    >
      {/* WordArt Transform: the label's words drawn bent (shared painter). */}
      <OfficeTextWarpMarker
        warp={shape.textWarp}
        shadow={shape.textPaint?.shadow ?? null}
        noWrap={body?.wrap === "none"}
        align={ownAlign ?? (textBox ? "left" : "center")}
      />
      {/* Text Effects > Shadow > Perspective on straight words (shared copy). */}
      <OfficeTextShadowCopyMarker warp={shape.textWarp} shadow={shape.textPaint?.shadow ?? null} />
      {keptHeight !== null ? <span data-spreadsheet-shape-text="kept" style={{ display: "block", maxHeight: keptHeight, overflow: "hidden", ...(drawsLayout ? { width: "100%" } : {}) }}>{content}</span> : content}
    </span>
  );
}

const CSS_ALIGN: Readonly<Record<string, "left" | "center" | "right" | "justify">> =
  {
    left: "left",
    center: "center",
    right: "right",
    justify: "justify",
    // No CSS keyword distributes the LAST line the way DrawingML's `dist`
    // does; `justify` is the nearest thing that does not move the other lines.
    distribute: "justify",
  };

/**
 * A line's marker as the sheet draws it: a bullet set in a symbol face
 * (`a:buFont` Symbol or Wingdings) is the symbol its code stands for, drawn
 * in the body's own font, as Excel prints it; any other marker as written
 * (lookwin R452-X59).
 */
function shapeLineMarkerText(line: OfficeTextLine): string {
  if (line.marker === null) return "";
  return officeSymbolMarker(line.markerTypeface, line.marker) ?? line.marker;
}

/** Whether a line states its own paragraph spacing. */
function lineSpaced(line: OfficeTextLine): boolean {
  return (
    line.lineSpacing !== undefined ||
    line.lineSpacingPoints !== undefined ||
    Boolean(line.spaceBeforePx) ||
    Boolean(line.spaceAfterPx)
  );
}

/**
 * A line's Line Spacing > Exactly as Windows Excel stands a worksheet
 * shape's (reading row 991): whole points, half up (14.4 stands 14, 14.5
 * stands 15; xlsx backlog bl6/lnex), in CSS px. Undefined without one.
 */
export function spreadsheetShapeExactLinePx(line: Pick<OfficeTextLine, "lineSpacing" | "lineSpacingPoints">): number | undefined {
  if (line.lineSpacing !== undefined || line.lineSpacingPoints === undefined) return undefined;
  return ptToPx(Math.floor(line.lineSpacingPoints + 0.5));
}

/**
 * How far (CSS px, down) a spaced line's words move from where CSS stands
 * them to where Windows Excel does: CSS centres the face's ascent and descent
 * in the line (half-leading); Excel stands the baseline three quarters down
 * a Multiple other than single and an Exactly line (the first line's too;
 * xlsx backlog bl5/lnspc, bl6/lnex), and an Exactly line shorter than its
 * type's own line keeps the type's descent under the baseline when a quarter
 * of the line is less (Arial 12 at 12 pt: 9.5 pt down, not 9). Zero for a
 * single line or a face whose lines are not recorded.
 */
export function spreadsheetShapeLineBaselineShift(
  line: Pick<OfficeTextLine, "lineSpacing" | "lineSpacingPoints">,
  face: string | undefined,
  sizePx: number,
  single: number,
): number {
  const exact = spreadsheetShapeExactLinePx(line);
  const multiple = line.lineSpacing;
  const eastAsian = face ? officeEastAsianWinLine(face) : undefined;
  if (!eastAsian && exact === undefined && (multiple === undefined || Math.abs(multiple - 1) < 1e-9)) return 0;
  if (!face || !(sizePx > 0)) return 0;
  const metrics = wordGridFontLineMetrics(face);
  const verticals = wordGridFontVerticals(face);
  if (!metrics || !verticals || !(metrics.box > 0) || !(verticals.descent >= 0) || verticals.descent >= metrics.box) return 0;
  const pitch = exact ?? single * (multiple ?? 1) * sizePx;
  const cssBaseline = (pitch - metrics.box * sizePx) / 2 + (metrics.box - verticals.descent) * sizePx;
  const own = (metrics.box + metrics.lineGap) * sizePx;
  // An East Asian face: three quarters down less its rise, (descent - 0.175 x
  // ascent and descent) of its size, single and Multiple alike; Exactly never
  // lower than three quarters (xlsx backlog bl8/lnex8-9: 游明朝 16 pt in 11
  // 1.0 pt above, Meiryo 2.83; ＭＳ 明朝 and Meiryo UI at three quarters).
  const rise = eastAsian
    ? (eastAsian.descent - EXCEL_EAST_ASIAN_RISE * (eastAsian.ascent + eastAsian.descent)) * sizePx
    : 0;
  const excelBaseline = eastAsian
    ? 0.75 * pitch - (exact !== undefined ? Math.max(0, rise) : rise)
    : exact !== undefined && pitch < own ? pitch - Math.min(0.25 * pitch, verticals.descent * sizePx) : 0.75 * pitch;
  const shift = excelBaseline - cssBaseline;
  return Number.isFinite(shift) && Math.abs(shift) > 0.01 ? shift : 0;
}

/**
 * One drawn line's CSS: the paragraph block and its marker. A hanging indent
 * IS `margin-inline-start` + a negative `text-indent`, and the marker fills
 * the gutter the negative indent opens, so the characters start exactly at
 * `a:pPr@marL` on every line of the paragraph. The same CSS at rest and in
 * the field the words are typed in (`spreadsheetShapeEditorParagraphs`).
 */
function shapeTextLineCss(
  line: OfficeTextLine,
  fallbackAlign: "left" | "center" | "right" | "justify",
  ownAlign: "left" | "center" | "right" | "justify" | undefined,
  fontSize: number,
  single: number = SPREADSHEET_SHAPE_TEXT_LINE_HEIGHT,
  face?: string,
): { block: CSSProperties; marker: CSSProperties } {
  const gutter = line.indentPx < 0 ? -line.indentPx : 0;
  const exact = spreadsheetShapeExactLinePx(line);
  // The words where Windows Excel stands them in a spaced line (reading row
  
  const shift = spreadsheetShapeLineBaselineShift(line, face, fontSize, single);
  return {
    block: {
      display: "block",
      marginInlineStart: line.marginPx ? `${line.marginPx}px` : undefined,
      textIndent: line.indentPx ? `${line.indentPx}px` : undefined,
      textAlign: ownAlign ?? ((line.align && CSS_ALIGN[line.align]) || fallbackAlign),
      // Paragraph ▸ Spacing: Before / After and Line Spacing (Multiple,
      // or Exactly in whole points).
      lineHeight:
        exact !== undefined
          ? `${exact}px`
          : line.lineSpacing !== undefined
            ? single * line.lineSpacing
            : undefined,
      ...(shift ? { position: "relative" as const, top: `${shift}px` } : {}),
      marginBlockStart: line.spaceBeforePx ? `${line.spaceBeforePx}px` : undefined,
      marginBlockEnd: line.spaceAfterPx ? `${line.spaceAfterPx}px` : undefined,
    },
    marker: {
      display: "inline-block",
      minWidth: gutter ? `${gutter}px` : undefined,
      // `text-indent` is inherited, and an inline-block is a line box of
      // its own: the paragraph's hanging indent would shift the marker's
      // glyphs out of the marker's own box by the same amount. Seen in a
      // real browser on corpus S047: the level-0 numbers left the frame
      // entirely and the level-1 numbers sat one gutter too far left.
      textIndent: 0,
      color: line.markerColor,
      // `a:buSzPct` is a MULTIPLE of the run size and `a:buSzPts` an
      // absolute point size; real PowerPoint scales the first with the
      // text and leaves the second alone (§40.3).
      fontSize:
        line.markerSizePt !== undefined
          ? `${line.markerSizePt}pt`
          : line.markerScale !== undefined
            ? `${fontSize * line.markerScale}px`
            : undefined,
    },
  };
}

function ShapeTextLine({
  line,
  fallbackAlign,
  ownAlign,
  fontSize,
  runSize,
  words,
  eastAsianLine = null,
  single = SPREADSHEET_SHAPE_TEXT_LINE_HEIGHT,
  emptyFace,
  face,
  mark,
}: {
  line: OfficeTextLine;
  /** The paragraph's end mark on its last line (`textLineMarks`): its
   * East Asian line and rise, per em. */
  mark?: { line: number; rise: number };
  /** The face the shape steps its lines by (`spreadsheetShapeLineFace`). */
  face?: string;
  /** An empty line's own end-mark face (`textEmptyLines`): its font stack
   * and its single line, per em. */
  emptyFace?: { stack: string; single: number };
  /** The paragraph's own font size (shapeParagraphRunSizes), when its runs state one. */
  runSize?: number;
  /** Office's East Asian line, per em, for a line holding East Asian text;
   * 0 for a Latin line in such a body (it keeps the 1.2 line); null when
   * the body has none (the line keeps its own CSS). */
  eastAsianLine?: number | null;
  /** The line's characters in their runs' own formats. */
  words?: ReactNode;
  fallbackAlign: "left" | "center" | "right" | "justify";
  /** Home ▸ Alignment on the shape: overrides the line's own receipt. */
  ownAlign?: "left" | "center" | "right" | "justify";
  fontSize: number;
  /** The body's single line, per em (`spreadsheetShapeSingleLine`). */
  single?: number;
}) {
  const exact = spreadsheetShapeExactLinePx(line) !== undefined;
  const css = shapeTextLineCss(
    line,
    fallbackAlign,
    ownAlign,
    runSize ?? fontSize,
    single,
    // An East Asian line and an empty line in its own face keep their CSS,
    // but a line in an East Asian face of Office's own lines.
    (eastAsianLine && !officeEastAsianWinLine(face)) || (emptyFace && !line.text) ? undefined : face,
  );
  if (runSize !== undefined && runSize !== fontSize) css.block.fontSize = `${runSize}px`;
  // An Exactly line stands its own height whatever its type (reading row 991).
  if (eastAsianLine !== null && !exact) {
    css.block.lineHeight = Math.max(single, eastAsianLine) * (line.lineSpacing ?? 1);
  }
  if (emptyFace && !line.text) {
    css.block.fontFamily = emptyFace.stack;
    if (!exact) css.block.lineHeight = emptyFace.single * (line.lineSpacing ?? 1);
  }
  return (
    <span data-spreadsheet-shape-line={line.marker === null ? "plain" : "marked"} style={css.block}>
      {line.marker !== null ? (
        <span aria-hidden="true" style={css.marker}>
          {shapeLineMarkerText(line)}
        </span>
      ) : null}
      {words ?? (line.text || "\u200b")}
      {mark && !exact && (line.lineSpacing ?? 1) === 1 && line.text ? (
        // The mark's line on the last line only: an empty box as tall as it,
        // its foot the line's quarter and rise below the baseline (the
        // server's `_hold_paragraph_mark`).
        <span
          aria-hidden="true"
          data-spreadsheet-shape-mark=""
          style={{
            display: "inline-block",
            width: 0,
            height: `${mark.line}em`,
            verticalAlign: `${-(0.25 * mark.line + mark.rise)}em`,
          }}
        />
      ) : null}
    </span>
  );
}


/**
 * Where a shape's label sits, as SpreadsheetShapeTextBody draws it: the
 * shape's own Home alignment, else the alignment every paragraph of the
 * file states, else top-left for a text box and centred for any other shape;
 * and the vertical anchor (the shape's own, else the file's, else the same
 * default). The in-shape editor types in the same place, so starting to edit
 * does not move the words.
 */
export function spreadsheetShapeTextPlacement(
  shape: SpreadsheetShapeStyle,
  textBox: boolean,
): { align: "left" | "center" | "right" | "justify"; anchor: "top" | "middle" | "bottom" } {
  const layout = normalizeOfficeTextLayout(shape.textLayout);
  const own =
    shape.textAlign === "left" || shape.textAlign === "center" || shape.textAlign === "right"
      ? shape.textAlign
      : shape.textAlign === "justify"
        ? ("justify" as const)
        : undefined;
  let align = own;
  if (!align && layout) {
    const stated = officeTextLayoutLines(shape.text ?? "", layout)
      .map((line) => (line.align ? CSS_ALIGN[line.align] : undefined));
    if (stated.length > 0 && stated[0] && stated.every((value) => value === stated[0])) align = stated[0];
  }
  const bodyAnchor = layout?.bodyPr?.anchor;
  const anchor =
    shape.textVerticalAlign === "top" || shape.textVerticalAlign === "middle" || shape.textVerticalAlign === "bottom"
      ? shape.textVerticalAlign
      : bodyAnchor === "t"
        ? "top"
        : bodyAnchor === "ctr"
          ? "middle"
          : bodyAnchor === "b"
            ? "bottom"
            : textBox
              ? "top"
              : "middle";
  return { align: align ?? (textBox ? "left" : "center"), anchor };
}
