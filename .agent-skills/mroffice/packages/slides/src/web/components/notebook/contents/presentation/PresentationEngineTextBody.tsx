"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A slide's text body drawn line by line where the text engine lays it out
 * (`lib/text-engine/office-text-body.ts`): every line ends where PowerPoint
 * ends it, stands on PowerPoint's baseline and spreads its words as
 * PowerPoint does, from the served font files' own advances. The browser
 * only paints the glyphs: each stretch of a run on a line is placed at the
 * engine's position, with no line breaking, kerning or ligatures of its own.
 *
 * The rows are read exactly as the browser-flowed drawing reads them
 * (`planPresentationParagraphRows`); a body the engine cannot lay out yet
 * (its faces still loading) or at all (an equation, a right-to-left row, a
 * face the page does not serve) is drawn the browser's way, so a body is
 * never drawn worse than before.
 *
 * Where it draws (`PresentationTextEngineSurfaceContext`): the deck's printed
 * pages and the slide thumbnails first (phase 2, step 1 of the text engine
 * plan, `lib/text-engine/PLAN-phase2.md`); the canvas follows with its caret.
 */

import { createContext, Fragment, memo, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactElement, type ReactNode } from "react";
import {
  layoutOfficeTextBody,
  type OfficeParagraphInput,
  type OfficeTextAlign,
  type OfficeTextBodyLayout,
  type OfficeTextFont,
  type OfficeTextRunInput,
} from "@mrnote/core/web/lib/text-engine/office-text-body.ts";
import { pageOfficeTextMeasurer } from "@mrnote/core/web/lib/text-engine/office-text-measurer.ts";
import { powerPointLineLanguage } from "@mrnote/core/web/lib/text-engine/powerpoint-east-asian.ts";
import { OFFICE_TEXT_HIT_ATTRIBUTE, registerOfficeTextHitMap } from "@mrnote/core/web/lib/text-engine/office-text-hit.ts";
import { OFFICE_TEXT_MARKER_ATTRIBUTE } from "@mrnote/core/web/lib/presentation/math-atom.ts";
import { onTextEngineChange, resolveFace, textEngineEpoch } from "@mrnote/core/web/lib/text-engine/measure.ts";
import { splitFamilyList } from "@mrnote/core/web/lib/text-engine/face-index.ts";
import { ensureOfficeFauxBoldProbe, OFFICE_FAUX_BOLD_STROKE_WIDTH } from "@mrnote/core/web/lib/office-fonts/faux-bold.ts";
import { officeUnderline } from "@mrnote/core/web/lib/text-engine/office-underline.ts";
import {
  OFFICE_TEXT_OUTLINE_COLOR,
  OFFICE_TEXT_OUTLINE_DASH,
  OFFICE_TEXT_OUTLINE_JOIN,
  OFFICE_TEXT_OUTLINE_WIDTH,
  officeTextOutlineStrokeOfMarks,
  type OfficeTextOutlineStroke,
  officeTextOutlineGlyph,
  officeTextOutlineGlyphsEpoch,
  subscribeOfficeTextOutlineGlyphs,
} from "@mrnote/core/web/lib/office-text-outline/office-text-outline-css.ts";
import { textEngineOn } from "@mrnote/core/web/lib/text-engine/page-adapter.ts";
import { snapEngineSvgRoot } from "@mrnote/core/web/lib/text-engine/svg-root-snap.ts";
import type { TextRun } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import { normalizePresentationTabStops } from "../../../../lib/presentation-tab-stops";
import { cssTextShadowParts, powerPointTextShadowParts, PRESENTATION_SCRIPT_SCALE, runStyleCss, TEXT_SHADOW_BASE_PROPERTY, type PresentationFontSizeUnit } from "../../../../lib/presentation/text-layout-css";
import { POWERPOINT_MISSING_SCRIPT_FAMILY, type PresentationFontAliases } from "@mrnote/core/web/lib/presentation-font-faces.ts";
import { presentationDisplayRuns, PresentationSlideNumberContext } from "./PresentationRunsText";
import type { ParagraphEastAsianLines } from "@mrnote/core/web/lib/presentation-paragraphs.ts";
import type { PresentationParagraphRowPlan } from "./presentationParagraphRows";
import { PresentationFontAliasesContext } from "./usePresentationFontFaces";

/** Whether the bodies drawn under it may be drawn by the text engine. */
export const PresentationTextEngineSurfaceContext = createContext(false);

/** The attribute a body still waiting for its faces carries (the print waits on it). */
export const PRESENTATION_TEXT_ENGINE_ATTRIBUTE = "data-text-engine";

const PX_PER_PT = 4 / 3;
const PT_PER_PX = 0.75;

/** A CSS length in px: a number, `Npx`, or `Nem` of `emPx`; null for anything else. */
function cssPx(value: unknown, emPx: number): number | null {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = /^\s*(-?[0-9]*\.?[0-9]+(?:e-?[0-9]+)?)(px|em)?\s*$/i.exec(value);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return match[2]?.toLowerCase() === "em" ? number * emPx : number;
}

function weightOf(value: unknown): number | null {
  if (value === undefined || value === null || value === "normal") return 400;
  if (value === "bold") return 700;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function alignOf(textAlign: unknown, textAlignLast: unknown): OfficeTextAlign | null {
  if (textAlignLast === "justify") return "dist";
  switch (textAlign) {
    case undefined:
    case null:
    case "left":
    case "start":
      return "l";
    case "center":
      return "ctr";
    case "right":
    case "end":
      return "r";
    case "justify":
      return "just";
    default:
      return null;
  }
}



















const scriptShiftPt = new WeakMap<object, number>();
function scriptRunCss(run: TextRun, css: CSSProperties, rowFontPx: number): CSSProperties {
  const style = run.style as { superscript?: boolean; subscript?: boolean } | undefined;
  if (!style?.superscript && !style?.subscript) return css;
  const drawn = cssPx(css.fontSize, rowFontPx);
  if (drawn === null || !(drawn > 0)) return css;
  const basePt = (drawn / PRESENTATION_SCRIPT_SCALE) * PT_PER_PX;
  const scriptPt = Math.max(1, Math.round((basePt * 2) / 3));
  scriptShiftPt.set(run, (style.superscript ? 0.3 : -0.25) * basePt);
  return { ...css, fontSize: scriptPt * PX_PER_PT, verticalAlign: undefined };
}

const APP_SYSTEM_STACK = /^\s*(?:system-ui|-apple-system|blinkmacsystemfont)\b/i;
const APP_SYSTEM_NAME = /^["']?\s*(?:system-ui|-apple-system|blinkmacsystemfont)\s*["']?$/i;
function officeFaceOr(stack: unknown, bodyFace: string | undefined): unknown {
  if (typeof stack !== "string" || !APP_SYSTEM_STACK.test(stack)) return stack;
  if (bodyFace && !APP_SYSTEM_STACK.test(bodyFace)) return bodyFace;
  // A run whose own face is a CSS system keyword (`a:latin
  // typeface="-apple-system"`): no font PowerPoint can have, so it draws the
  // run as it draws any face it lacks, in the stand-in the stack carries after
  
  // in PowerPoint's PDF). Only that stack: the app's own system default stays.
  const families = stack.split(",").map((family) => family.trim());
  if (!families.some((family) => family.replace(/^["']|["']$/g, "") === POWERPOINT_MISSING_SCRIPT_FAMILY)) return stack;
  while (families.length && APP_SYSTEM_NAME.test(families[0])) families.shift();
  return families.join(", ");
}

/** A body the engine leaves to the browser: thrown as a plain value (no stack taken), caught below. */
class Unsupported {
  constructor(readonly message: string) {}
}

/** A length the page wrote from points (rounded to hundredths of a px), read back as the hundredths of a point it was. */
function hundredthPt(px: number): number {
  return Math.round(px * PT_PER_PX * 100) / 100;
}

function need<T>(value: T | null | undefined, why: string): T {
  if (value === null || value === undefined) throw new Unsupported(why);
  return value;
}

interface EngineBodyInput {
  readonly paragraphs: OfficeParagraphInput[];
  /** Each row's runs as drawn (fields shown as the slide shows them). */
  readonly rowRuns: TextRun[][];
  /**
   * Each row's runs' text shadow, the CSS `text-shadow` the browser-flowed
   * drawing gives them (their own over their row's over the body's; "" for
   * none): SVG text takes no `text-shadow`, so the line draws it itself
   * (`PresentationEngineLine`'s shadow copy).
   */
  readonly rowShadows?: string[][];
}

/** A `rowShadows` entry read from the shadow's model (`TEXT_SHADOW_BASE_PROPERTY`), which each line scales by its largest size. */
const ENGINE_SHADOW_BASE_MARK = "model:";

/** Everything the CSS cascade gives a run: its own style over its row's over the body's. */
function cascade(own: CSSProperties, row: CSSProperties, body: CSSProperties, key: keyof CSSProperties): unknown {
  return own[key] ?? row[key] ?? body[key];
}

/**
 * The engine's reading of a planned body, or why it cannot read it. Px are
 * the slide's design pixels (96 per inch); the engine works in points.
 */
export function presentationEngineBodyInput(args: {
  rows: readonly PresentationParagraphRowPlan[];
  bodyStyle: CSSProperties;
  fontSizeUnit: PresentationFontSizeUnit;
  fontAliases: PresentationFontAliases;
  autofitScale: number;
  slideNumber: number | undefined;
  tabStops: unknown;
  /** The default tab interval (`@defTabSz`), design px; unstated, an inch. */
  defaultTabPx?: unknown;
  /** `source.nativeKerning`: the size (pt) from which PowerPoint kerns each row's pairs. */
  kerning?: unknown;
  /** `source.nativeEastAsianLines` (readings row 1001): PowerPoint's own East Asian line rules. */
  eastAsianLines?: unknown;
  /** `source.nativeLineBox` (readings row 1013): the lines as PowerPoint for Windows stands them. */
  lineBox?: unknown;
  /** `source.nativeMarkLines` (readings row 1013): each paragraph's empty last line's mark ({@link presentationEmptyLineFonts}). */
  markLines?: unknown;
  /** A flat body (no `paragraphs`): its text and runs, whose breaks set its empty rows (row 1013). */
  flatText?: string;
  flatRuns?: unknown;
  now?: Date;
}): EngineBodyInput | { unsupported: string } {
  const { rows, bodyStyle, fontSizeUnit, fontAliases, autofitScale } = args;
  try {
    const tabStops = normalizePresentationTabStops(args.tabStops);
    if (tabStops.some((stop) => stop.align !== "left")) throw new Unsupported("aligned tab stop");
    const paragraphs: OfficeParagraphInput[] = [];
    const rowRuns: TextRun[][] = [];
    const rowShadows: string[][] = [];
    // A row's own receipts (readings row 1009) go with it through edits; a
    // body whose rows carry none reads the body's, row by row number.
    const rowsCarryKerning = rows.some((row) => row.nativeKerning !== undefined);
    const rowsCarryEastAsianLines = rows.some((row) => row.nativeEastAsianLines !== undefined);
    const kerningOf = (row: PresentationParagraphRowPlan): number | null => {
      const value = rowsCarryKerning
        ? row.nativeKerning
        : Array.isArray(args.kerning) ? args.kerning[row.index] : args.kerning;
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
    };
    // A body imported under readings row 1001: each run breaks by its own
    // language (its `lang` / `altLang`, else what its row inherits) and the
    // row hangs punctuation unless it resolves `hangingPunct` 0.
    const bodyEastAsianLines =
      args.eastAsianLines && typeof args.eastAsianLines === "object" && !Array.isArray(args.eastAsianLines)
        ? (args.eastAsianLines as Record<string, unknown>)
        : null;
    // A body imported under readings row 1013 (`source.nativeLineBox`).
    const windowsLineBox = presentationWindowsLineBox(args.lineBox);
    // Under it, an empty line a paragraph ends on is laid in its mark's (or its break's) size and face.
    const emptyLineFonts = windowsLineBox
      ? presentationEmptyLineFonts({ markLines: args.markLines, flatText: args.flatText, flatRuns: args.flatRuns, rowCount: rows.length })
      : [];
    const eastAsianLines = rowsCarryEastAsianLines || bodyEastAsianLines !== null;
    const eastAsianRow = (key: keyof ParagraphEastAsianLines, row: PresentationParagraphRowPlan): unknown => {
      if (rowsCarryEastAsianLines) return row.nativeEastAsianLines?.[key];
      const value = bodyEastAsianLines?.[key];
      return Array.isArray(value) ? value[row.index] : value;
    };
    // A row with no words of its own (an empty paragraph, a marker's face
    // nobody states) takes the face the body's words are in, as its end
    // mark does in PowerPoint (the body's first stated face).
    const bodyFace = (() => {
      for (const row of rows) {
        const stated = row.rowTextStyle.fontFamily ?? row.runs?.map((run) => runStyleCss(run.style, fontSizeUnit, fontAliases, autofitScale).fontFamily).find(Boolean);
        if (typeof stated === "string" && stated.trim()) return stated;
      }
      return typeof bodyStyle.fontFamily === "string" ? bodyStyle.fontFamily : undefined;
    })();
    for (const row of rows) {
      if (row.dir === "rtl") throw new Unsupported("right-to-left row");
      const kernFrom = kerningOf(row);
      const rowStyle = row.rowTextStyle;
      const bodyFontPx = need(cssPx(bodyStyle.fontSize ?? 24, 16), "body size");
      const rowFontPx = need(cssPx(rowStyle.fontSize ?? bodyStyle.fontSize ?? 24, bodyFontPx), "row size");
      const fontOf = (css: CSSProperties): OfficeTextFont => {
        const stack = officeFaceOr(cascade(css, rowStyle, bodyStyle, "fontFamily") ?? bodyFace, bodyFace);
        if (typeof stack !== "string" || !stack.trim()) throw new Unsupported("no face");
        if (cascade(css, rowStyle, bodyStyle, "fontVariant") === "small-caps") throw new Unsupported("small capitals");
        const size = need(cssPx(css.fontSize ?? rowStyle.fontSize ?? bodyStyle.fontSize ?? 24, rowFontPx), "run size");
        // DrawingML sizes are hundredths of a point; the CSS px they were
        // written as are rounded to hundredths of a pixel (10 pt -> 13.33 px
        // -> 9.9975 pt), and that shift moves glyph advances across the
        
        const sizePt = Math.round(size * PT_PER_PX * 100) / 100;
        return {
          stack,
          weight: need(weightOf(cascade(css, rowStyle, bodyStyle, "fontWeight")), "weight"),
          italic: cascade(css, rowStyle, bodyStyle, "fontStyle") === "italic",
          sizePt,
          // PowerPoint kerns a run's pairs from the row's `kern` size up.
          ...(kernFrom !== null && sizePt >= kernFrom - 1e-6 ? { kerning: true } : {}),
        };
      };
      const displayed = presentationDisplayRuns(row.runs ?? undefined, args.slideNumber, args.now ?? new Date()) ??
        (row.text ? [{ text: row.text }] : []);
      const shadows: string[] = [];
      const runs: OfficeTextRunInput[] = displayed.map((run) => {
        if (run.math) throw new Unsupported("equation");
        // WordArt on a run (gradient fills, outlines, effects) and symbol-font
        // characters are the browser drawing's.
        if (run.style?.textPaint) throw new Unsupported("run WordArt");
        if (/[\uf000-\uf0ff]/.test(run.text)) throw new Unsupported("symbol-font characters");
        const css = scriptRunCss(run, row.runs ? runStyleCss(run.style, fontSizeUnit, fontAliases, autofitScale) : {}, rowFontPx);
        const font = fontOf(css);
        // The shadow as its model reads (unscaled: each line scales it by its
        // own largest size), else a plain CSS text-shadow as drawn.
        const base = cascade(css, rowStyle, bodyStyle, TEXT_SHADOW_BASE_PROPERTY as keyof CSSProperties);
        const drawn = cascade(css, rowStyle, bodyStyle, "textShadow");
        shadows.push(
          typeof base === "string" && base.trim()
            ? `${ENGINE_SHADOW_BASE_MARK}${base.trim()}`
            : typeof drawn === "string" && drawn.trim() && drawn.trim() !== "none" ? drawn.trim() : "",
        );
        const spacing = cascade(css, rowStyle, bodyStyle, "letterSpacing");
        const spacingPx = spacing === "normal" ? 0 : need(cssPx(spacing, font.sizePt * PX_PER_PT), "letter spacing");
        return {
          text: run.text,
          font,
          ...(spacingPx ? { letterSpacingPt: hundredthPt(spacingPx) } : {}),
          ...(cascade(css, rowStyle, bodyStyle, "textTransform") === "uppercase" ? { allCaps: true } : {}),
          ...(eastAsianLines
            ? {
                lineLanguage: powerPointLineLanguage(
                  run.style?.proofingLanguage ?? eastAsianRow("lang", row),
                  run.style?.alternateLanguage ?? eastAsianRow("altLang", row),
                  eastAsianRow("koreanRules", row) === true,
                ),
              }
            : {}),
        };
      });
      rowRuns.push(displayed);
      rowShadows.push(shadows);
      // The font of the line that holds only the mark (or, in a flat body, only a break): readings row 1013.
      const emptyLine = emptyLineFonts[row.index];
      const endFont = emptyLine
        ? fontOf(runStyleCss({ fontSize: emptyLine.sizePt, ...(emptyLine.face ? { fontFamily: emptyLine.face } : {}) }, fontSizeUnit, fontAliases, autofitScale))
        : fontOf({});
      const align = need(alignOf(rowStyle.textAlign ?? bodyStyle.textAlign, rowStyle.textAlignLast ?? bodyStyle.textAlignLast), "alignment");
      // Line spacing: a unitless CSS line height is the percentage times
      // Office's single line (its autofit reduction already taken off); a
      // length is Line Spacing > Exactly.
      const lineHeight = rowStyle.lineHeight ?? bodyStyle.lineHeight ?? 1.2;
      const lineSpacing = typeof lineHeight === "number"
        ? { kind: "percent" as const, value: lineHeight / 1.2 }
        : { kind: "points" as const, value: hundredthPt(need(cssPx(lineHeight, rowFontPx), "line height")) };
      // The row's own spacing over its style's, as the drawn row stacks them:
      // a preserved diagram's label states its drawing's (`paragraphMetrics`,
      // none before its first row or after its last).
      const before = need(cssPx(row.indentCss.paddingTop ?? rowStyle.paddingTop, rowFontPx), "space before");
      const after = need(cssPx(row.indentCss.paddingBottom ?? rowStyle.paddingBottom, rowFontPx), "space after");
      // The row's own indentation over its gutter, as the row's flex box reads it.
      const indent = { ...row.gutterCss, ...pickIndent(rowStyle), ...row.indentCss };
      const start = need(cssPx(indent.paddingInlineStart, rowFontPx), "indent");
      const end = need(cssPx(indent.paddingInlineEnd, rowFontPx), "right indent");
      const textIndent = need(cssPx(indent.textIndent, rowFontPx), "first line");
      let marker: OfficeParagraphInput["marker"];
      if (row.markerText !== undefined || row.markerPicture) {
        if (row.markerFollowsText) throw new Unsupported("marker that moves with its text");
        const markerSizePx = need(cssPx(row.markerCss.fontSize ?? rowFontPx, rowFontPx), "marker size");
        const markerFont: OfficeTextFont = {
          stack: String(officeFaceOr(row.markerCss.fontFamily ?? rowStyle.fontFamily ?? bodyStyle.fontFamily ?? bodyFace, bodyFace) ?? ""),
          weight: need(weightOf(row.markerCss.fontWeight ?? rowStyle.fontWeight ?? bodyStyle.fontWeight), "marker weight"),
          italic: (row.markerCss.fontStyle ?? rowStyle.fontStyle ?? bodyStyle.fontStyle) === "italic",
          sizePt: Math.round(markerSizePx * PT_PER_PX * 100) / 100,
        };
        if (!markerFont.stack) throw new Unsupported("marker face");
        const box = row.markerBoxCss;
        const hanging = box.width !== undefined;
        const offsetPx = need(cssPx(box.marginInlineStart, markerSizePx), "marker offset");
        const boxPx = hanging ? need(cssPx(box.width, markerSizePx), "marker width") : 1.4 * markerSizePx;
        const gapPx = need(cssPx(indent.gap, rowFontPx), "marker gap");
        marker = {
          text: row.markerText ?? "",
          font: markerFont,
          ...(row.markerSymbol ? { symbol: row.markerSymbol } : {}),
          // A bullet in PowerPoint's fallback face: its width there (`powerPointBulletFace`).
          ...(row.markerFallback ? { fallback: row.markerFallback } : {}),
          // A picture marker is as wide as it is tall: the text's height.
          ...(row.markerPicture ? { widthPt: markerSizePx * PT_PER_PX } : {}),
          leftPt: Math.max(0, start + offsetPx) * PT_PER_PX,
          boxPt: boxPx * PT_PER_PX,
          gapPt: gapPx * PT_PER_PX,
          hanging,
        };
      }
      paragraphs.push({
        runs,
        endFont,
        // The mark's Latin face as the file states it (readings row 899), and
        // under row 1013 as a font the line that holds the mark is laid by.
        ...(row.endLatinFace ? { markLatinFace: row.endLatinFace } : {}),
        ...(windowsLineBox && row.endLatinFace
          ? { markLatinFont: fontOf({ fontFamily: runStyleCss({ fontFamily: row.endLatinFace }, fontSizeUnit, fontAliases, autofitScale).fontFamily }) }
          : {}),
        ...(row.endsInLineBreak ? { endsInLineBreak: true as const } : {}),
        align,
        marginLeftPt: start * PT_PER_PX,
        marginRightPt: end * PT_PER_PX,
        indentPt: textIndent * PT_PER_PX,
        lineSpacing,
        spaceBeforePt: hundredthPt(before),
        spaceAfterPt: hundredthPt(after),
        ...(marker ? { marker } : {}),
        tabStops: tabStops.map((stop) => ({ positionPt: stop.pos * PT_PER_PX, align: "l" as const })),
        defaultTabPt:
          typeof args.defaultTabPx === "number" && args.defaultTabPx > 0 ? args.defaultTabPx * PT_PER_PX : 72,
        kinsoku: "zh-CN",
        ...(eastAsianLines
          ? {
              powerPointEastAsian: {
                hangingPunct: eastAsianRow("hangingPunct", row) !== false,
                ...(eastAsianRow("latinLnBrk", row) === true ? { latinLineBreak: true } : {}),
                ...(eastAsianRow("eaLnBrk", row) === false ? { eastAsianRules: false } : {}),
              },
            }
          : {}),
        ...(row.fontAlign ? { fontAlign: row.fontAlign } : {}),
      });
    }
    return { paragraphs, rowRuns, rowShadows };
  } catch (error) {
    if (error instanceof Unsupported) return { unsupported: error.message };
    throw error;
  }
}

function pickIndent(style: CSSProperties): CSSProperties {
  const out: CSSProperties = {};
  if (style.paddingInlineStart !== undefined) out.paddingInlineStart = style.paddingInlineStart;
  if (style.paddingInlineEnd !== undefined) out.paddingInlineEnd = style.paddingInlineEnd;
  if (style.textIndent !== undefined) out.textIndent = style.textIndent;
  if (style.gap !== undefined) out.gap = style.gap;
  return out;
}

/** Re-render when the engine's faces land; the epoch keys every layout. */
function useTextEngineEpoch(active: boolean): string {
  const [epoch, setEpoch] = useState(() => (active ? textEngineEpoch() : ""));
  useEffect(() => {
    if (!active) return;
    const update = () => setEpoch(textEngineEpoch());
    update();
    return onTextEngineChange(update);
  }, [active]);
  return epoch;
}

export type PresentationEngineBodyAnswer =
  | { readonly status: "ok"; readonly layout: Extract<OfficeTextBodyLayout, { status: "ok" }>; readonly input: EngineBodyInput }
  | { readonly status: "pending" }
  | { readonly status: "off" };

/**
 * The engine's layout of a body for this surface: `ok` to draw it line by
 * line, `pending` while its faces load (drawn the browser's way meanwhile,
 * the print waiting), `off` where the browser draws it.
 */
export function usePresentationEngineBody(args: {
  enabled: boolean;
  rows: readonly PresentationParagraphRowPlan[] | null;
  bodyStyle: CSSProperties;
  fontSizeUnit: PresentationFontSizeUnit;
  fontAliases: PresentationFontAliases;
  autofitScale: number;
  tabStops: unknown;
  defaultTabPx?: unknown;
  kerning?: unknown;
  /** `source.nativeEastAsianLines` (readings row 1001). */
  eastAsianLines?: unknown;
  /** `source.nativeLineBox` (readings row 1013). */
  lineBox?: unknown;
  /** `source.nativeMarkLines` and a flat body's text and runs (readings row 1013, {@link presentationEmptyLineFonts}). */
  markLines?: unknown;
  flatText?: string;
  flatRuns?: unknown;
  widthPx: number | null;
  wrap: boolean;
  /** Lay out whatever the surface: the lines a body being typed in should end at. */
  force?: boolean;
  /** A SmartArt diagram's label: lines step by the faces' own line height (`OfficeTextBodyInput.naturalLines`). */
  naturalLines?: boolean;
}): PresentationEngineBodyAnswer {
  const surface = useContext(PresentationTextEngineSurfaceContext) || args.force === true;
  const slideNumber = useContext(PresentationSlideNumberContext);
  const active = args.enabled && surface && args.rows !== null && args.widthPx !== null && textEngineOn("slides");
  const epoch = useTextEngineEpoch(active);
  const { rows, bodyStyle, fontSizeUnit, fontAliases, autofitScale, tabStops, defaultTabPx, kerning, eastAsianLines, lineBox, markLines, flatText, flatRuns, widthPx, wrap } = args;
  const naturalLines = args.naturalLines === true;
  return useMemo((): PresentationEngineBodyAnswer => {
    void epoch;
    if (!surface) return { status: "off" };
    if (!active || !rows || widthPx === null) return noteEngine("off", !args.enabled ? "not a candidate" : !rows ? "no rows" : widthPx === null ? "no width" : "switched off");
    const input = presentationEngineBodyInput({ rows, bodyStyle, fontSizeUnit, fontAliases, autofitScale, slideNumber, tabStops, defaultTabPx, kerning, eastAsianLines, lineBox, markLines, flatText, flatRuns });
    if ("unsupported" in input) return noteEngine("off", input.unsupported);
    const layout = layoutOfficeTextBody({ widthPt: widthPx * PT_PER_PX, wrap, paragraphs: input.paragraphs, naturalLines, ...(presentationWindowsLineBox(lineBox) ? { windowsLineBox: true } : {}) }, pageOfficeTextMeasurer);
    if (layout.status === "pending") return noteEngine("pending", "pending");
    if (layout.status === "unsupported") return noteEngine("off", layout.reason);
    return noteEngine("ok", "laid", { status: "ok", layout, input });
  }, [surface, active, args.enabled, epoch, rows, bodyStyle, fontSizeUnit, fontAliases, autofitScale, slideNumber, tabStops, defaultTabPx, kerning, eastAsianLines, lineBox, markLines, flatText, flatRuns, widthPx, wrap, naturalLines]);
}

/** The size (pt) and Latin face an empty line is laid in. */
export interface PresentationEmptyLineFont {
  readonly sizePt: number;
  readonly face?: string;
}

















export function presentationEmptyLineFonts(args: {
  markLines: unknown;
  flatText?: string;
  flatRuns?: unknown;
  rowCount: number;
}): (PresentationEmptyLineFont | undefined)[] {
  const read = (value: unknown): PresentationEmptyLineFont | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const raw = value as { sizePt?: unknown; face?: unknown };
    const size = raw.sizePt;
    if (typeof size !== "number" || !Number.isFinite(size) || size < 1 || size > 4000) return undefined;
    const face = typeof raw.face === "string" && raw.face.trim() ? raw.face.trim() : undefined;
    return face ? { sizePt: size, face } : { sizePt: size };
  };
  const marks = Array.isArray(args.markLines) ? args.markLines.map(read) : [];
  const out: (PresentationEmptyLineFont | undefined)[] = new Array(args.rowCount).fill(undefined);
  if (typeof args.flatText !== "string") {
    for (let index = 0; index < args.rowCount; index += 1) out[index] = marks[index];
    return out;
  }
  const rows = args.flatText.split("\n");
  if (rows.length !== args.rowCount) return out;
  const runText = (run: unknown): string =>
    run && typeof run === "object" && typeof (run as { text?: unknown }).text === "string" ? (run as { text: string }).text : "";
  // Runs that are not the text's own (a stale copy) say nothing of its breaks.
  const runs = Array.isArray(args.flatRuns) && args.flatRuns.map(runText).join("") === args.flatText ? args.flatRuns : [];
  // The style of the run that holds the text's character at `offset`.
  const styleAt = (offset: number): { fontSize?: unknown; fontFamily?: unknown } | undefined => {
    let start = 0;
    for (const run of runs) {
      const text = runText(run);
      if (offset >= start && offset < start + text.length) {
        const style = (run as { style?: unknown }).style;
        return style && typeof style === "object" ? (style as { fontSize?: unknown; fontFamily?: unknown }) : undefined;
      }
      start += text.length;
    }
    return undefined;
  };
  let offset = 0;
  rows.forEach((row, index) => {
    const breakAt = offset + row.length;
    if (index === rows.length - 1) {
      if (row === "" && index > 0) out[index] = marks[0];
    } else if (row === "") {
      const style = styleAt(breakAt);
      out[index] = read({ sizePt: style?.fontSize, face: style?.fontFamily });
    }
    offset = breakAt + 1;
  });
  return out;
}

/** Whether a body's receipt says its lines stand as PowerPoint for Windows stands them (readings row 1013). */
export function presentationWindowsLineBox(value: unknown): boolean {
  return value === 1013;
}

/**
 * Where each row's lines after its first start, as offsets in the row's text
 * (`ENGINE_LINE_STARTS_ATTRIBUTE`): the browser's rows of a body being typed
 * in are fitted to end their lines there (`powerpoint-line-fit-dom`).
 */
export function presentationEngineLineStarts(answer: Extract<PresentationEngineBodyAnswer, { status: "ok" }>): string[] {
  return answer.layout.paragraphs.map((paragraph, rowIndex) => {
    const runs = answer.input.rowRuns[rowIndex] ?? [];
    const runStarts: number[] = [];
    let total = 0;
    for (const run of runs) {
      runStarts.push(total);
      total += run.text.length;
    }
    return paragraph.lines
      .slice(1)
      .map((line) => line.segments[0])
      .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment))
      .map((segment) => (runStarts[segment.run] ?? 0) + segment.start)
      .join(",");
  });
}

/**
 * What the engine answered for the bodies of this page, by reason
 * (`window.__mraiSlidesEngine`): the probes read it to see which bodies are
 * still drawn the browser's way, and why.
 */
function noteEngine(status: "ok" | "pending" | "off", reason: string, answer?: PresentationEngineBodyAnswer): PresentationEngineBodyAnswer {
  if (typeof window !== "undefined") {
    const tally = ((window as unknown as { __mraiSlidesEngine?: Record<string, number> }).__mraiSlidesEngine ??= {});
    const key = `${status}: ${reason.slice(0, 80)}`;
    tally[key] = (tally[key] ?? 0) + 1;
  }
  return answer ?? ({ status } as PresentationEngineBodyAnswer);
}

/**
 * A run's look as SVG text paints it, from the CSS the browser-flowed drawing
 * gives it: its colour as the fill, its face, size, weight, slant and lines.
 * Its spacing is not: every grapheme stands at the engine's own position.
 */
export function svgTextPaint(css: CSSProperties, colorOverride: string | undefined): CSSProperties {
  const out: CSSProperties = {
    fontFamily: css.fontFamily,
    fontSize: css.fontSize,
    fontWeight: css.fontWeight,
    fontStyle: css.fontStyle,
    textDecoration: css.textDecoration,
    textDecorationStyle: css.textDecorationStyle,
  };
  const color = colorOverride ?? css.color;
  if (color !== undefined) out.fill = color as CSSProperties["fill"];
  const outline = outlineOf(css);
  if (outline) {
    // SVG text takes no -webkit-text-stroke: Office's outline as SVG's
    // stroke, centred and round over the fill (the glyphs' merged outlines
    // replace it where they are kept: PresentationEngineLine).
    out.stroke = outline.color;
    out.strokeWidth = `${outline.widthPt}pt`;
    // Its join, cap and dash as Office states them (round, solid if none).
    out.strokeLinejoin = outline.stroke.join;
    if (outline.stroke.join === "miter") out.strokeMiterlimit = outline.stroke.miterLimit;
    out.strokeLinecap = outline.stroke.dash ? outline.stroke.cap : "round";
    if (outline.stroke.dash) out.strokeDasharray = outline.stroke.dash.map((length) => `${length * outline.widthPt}pt`).join(" ");
    out.paintOrder = "normal";
  } else if (css.WebkitTextStroke) out.WebkitTextStroke = css.WebkitTextStroke;
  return out;
}

/**
 * The faux-bold stroke of a run the engine measured in a bold it synthesizes
 * (no declared face of the weight: Calibri Light, Open Sans SemiBold, 宋体
 * b="1"): Windows draws such a bold as the regular emboldened, and Chrome on
 * macOS synthesizes none, so the run is stroked in its fill at
 * --office-faux-bold-stroke (lib/office-fonts/faux-bold: measured once, 0
 * wherever the browser emboldens it itself). Empty for any other run.
 */
export function engineFauxBoldPaint(
  measured: { readonly stack: string; readonly weight: number; readonly italic: boolean },
  codePoint: number,
  fill: CSSProperties["fill"] | undefined,
): CSSProperties {
  if (measured.weight < 600) return {};
  const face = resolveFace(splitFamilyList(measured.stack), measured.weight, measured.italic, codePoint, true);
  if (typeof face !== "object" || !face.syntheticBold) return {};
  ensureOfficeFauxBoldProbe();
  return { stroke: (fill ?? "currentColor") as CSSProperties["stroke"], strokeWidth: OFFICE_FAUX_BOLD_STROKE_WIDTH, strokeLinejoin: "round" };
}

/** A run's Office outline as its CSS states it (office-text-outline-css.ts). */
function outlineOf(css: CSSProperties): { color: string; widthPt: number; stroke: OfficeTextOutlineStroke } | null {
  const record = css as Record<string, unknown>;
  const color = record[OFFICE_TEXT_OUTLINE_COLOR];
  const widthPt = Number(record[OFFICE_TEXT_OUTLINE_WIDTH]);
  const mark = (key: string) => (typeof record[key] === "string" ? record[key] as string : "");
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) && widthPt > 0
    ? { color, widthPt, stroke: officeTextOutlineStrokeOfMarks(mark(OFFICE_TEXT_OUTLINE_JOIN), mark(OFFICE_TEXT_OUTLINE_DASH)) }
    : null;
}

const SVG_TEXT_STYLE: CSSProperties = {
  whiteSpace: "pre",
  fontKerning: "none",
  fontVariantLigatures: "none",
  letterSpacing: 0,
  wordSpacing: 0,
};















export const ENGINE_SVG_STYLE: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  overflow: "visible",
  direction: "ltr",
};

/**
 * The engine's `<svg>` root, its drawing in an inner group that takes back the
 * fraction of a pixel the browser's snap of the root would take from it
 * (`snapEngineSvgRoot`): the words on screen and in print where the engine
 * laid them.
 */
export function EngineSvgRoot({ children, testId }: { children: ReactNode; testId?: string }): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  // Every draw: its words or its place may have moved.
  useLayoutEffect(() => {
    if (svgRef.current && groupRef.current) return snapEngineSvgRoot(svgRef.current, groupRef.current);
  });
  return (
    <svg ref={svgRef} data-testid={testId} style={ENGINE_SVG_STYLE}>
      <g ref={groupRef} data-engine-snap="">{children}</g>
    </svg>
  );
}









export function presentationEngineMarkerPaint(
  rowStyle: CSSProperties,
  markerCss: CSSProperties,
  colorOverride: string | undefined,
  measured: OfficeTextFont | undefined,
): CSSProperties {
  const paint = svgTextPaint({ ...rowStyle, ...markerCss }, colorOverride ?? (markerCss.color as string | undefined));
  return measured ? { ...paint, fontSize: px(measured.sizePt) } : paint;
}

/** Positions in CSS px, at most 1/1000 px apart from the engine's. */
function px(points: number): number {
  return Math.round(points * PX_PER_PT * 1000) / 1000;
}

/**
 * The body drawn from an `ok` layout, as SVG text: each run's stretch of
 * each line a `tspan` whose every grapheme stands at the engine's position
 * on the line's baseline -- PowerPoint's 1/8 pt advances, its kerning and
 * its justification, whatever advances the platform's text stack would
 * have used (Chromium on Linux rounds each to a whole pixel: up to 0.37 pt
 * a glyph). The marker of a row stands on its first line.
 */
type EngineLaidLine = Extract<OfficeTextBodyLayout, { status: "ok" }>["paragraphs"][number]["lines"][number];

/** A style object's contents as a string, once per object (styles are not changed in place). */
const styleKeys = new WeakMap<object, string>();
function styleKey(style: unknown): string {
  if (!style || typeof style !== "object") return "";
  let key = styleKeys.get(style);
  if (key === undefined) {
    key = JSON.stringify(style) ?? "";
    styleKeys.set(style, key);
  }
  return key;
}

/**
 * Everything one line's drawing is made of: where it stands, and each of its
 * stretches' run, look, face and glyph positions. Two lines with one
 * signature (and one body style) draw the same elements.
 */
function engineLineSignature(
  line: EngineLaidLine,
  runs: readonly TextRun[],
  runInputs: readonly OfficeTextRunInput[],
  shadows: readonly string[],
): string {
  let out = `${line.baseline}|${line.top}|${line.bottom}`;
  for (const segment of line.segments) {
    if (segment.tab) continue;
    const run = runs[segment.run];
    if (!run) continue;
    const input = runInputs[segment.run];
    const font = input?.font;
    out += `\u0001${segment.run}|${segment.x}|${segment.width}|${styleKey(run.style)}|${font ? `${font.stack}|${font.sizePt}|${font.weight}|${font.italic ? 1 : 0}` : ""}|${input?.allCaps ? 1 : 0}|${scriptShiftPt.get(run) ?? ""}|${segment.baseline ?? ""}|${shadows[segment.run] ?? ""}|`;
    for (const glyph of segment.glyphs) out += `${glyph.text}\u0002${glyph.x}\u0003`;
  }
  return out;
}

interface EngineDrawingParts {
  readonly rows: readonly PresentationParagraphRowPlan[];
  /** Per row, per line: `engineLineSignature`. */
  readonly lines: readonly (readonly string[])[];
  /** Per row: its own look (style, marker) and whether it has runs. */
  readonly rowKeys: readonly string[];
  /** The whole drawing, its hit map (each row's run lengths) and its height. */
  readonly whole: string;
}

/** An answer's drawing, read once per answer and rows (answers are not changed once made). */
const drawingParts = new WeakMap<object, EngineDrawingParts>();
function engineDrawingParts(
  answer: Extract<PresentationEngineBodyAnswer, { status: "ok" }>,
  rows: readonly PresentationParagraphRowPlan[],
): EngineDrawingParts {
  const known = drawingParts.get(answer);
  if (known && known.rows === rows) return known;
  const { layout, input } = answer;
  const lines: string[][] = [];
  const rowKeys: string[] = [];
  let whole = `${layout.height}`;
  layout.paragraphs.forEach((paragraph, rowIndex) => {
    const row = rows[rowIndex];
    const runs = input.rowRuns[rowIndex] ?? [];
    const runInputs = input.paragraphs[rowIndex]?.runs ?? [];
    const rowKey = row
      ? `${row.runs ? 1 : 0}|${styleKey(row.rowTextStyle)}|${styleKey(row.markerCss)}|${row.markerText ?? ""}|${row.markerPicture ?? ""}`
      : "-";
    rowKeys.push(rowKey);
    const signatures = paragraph.lines.map((line) => engineLineSignature(line, runs, runInputs, input.rowShadows?.[rowIndex] ?? []));
    lines.push(signatures);
    whole += `\u0004${rowKey}|${paragraph.marker ? paragraph.marker.x : ""}|${runs.map((run) => run.text.length).join(",")}\u0005${signatures.join("\u0006")}`;
  });
  const parts = { rows, lines, rowKeys, whole };
  drawingParts.set(answer, parts);
  return parts;
}

/**
 * Whether two answers draw one body the same: the same elements, the same
 * hit map. A body being typed in keeps the drawing it made for the letters
 * when the window then lays the same letters out (`PresentationEngineEditLayer`).
 */
export function presentationEngineDrawsSame(
  a: Extract<PresentationEngineBodyAnswer, { status: "ok" }>,
  aRows: readonly PresentationParagraphRowPlan[],
  b: Extract<PresentationEngineBodyAnswer, { status: "ok" }>,
  bRows: readonly PresentationParagraphRowPlan[],
): boolean {
  if (a === b && aRows === bRows) return true;
  return engineDrawingParts(a, aRows).whole === engineDrawingParts(b, bRows).whole;
}

/** A stretch of a line under one text shadow ("" none): its spans, outline fills and bands, underlines and x extent (pt). */
interface EngineLineChunk {
  readonly shadow: string;
  readonly spans: ReactElement[];
  readonly fills: ReactElement[];
  readonly bands: ReactElement[];
  readonly underlines: { x0: number; x1: number; top: number; height: number; color: string }[];
  x0: number;
  x1: number;
}

interface EngineLineProps {
  readonly signature: string;
  readonly rowKey: string;
  readonly line: EngineLaidLine;
  readonly lineIndex: number;
  readonly row: PresentationParagraphRowPlan | undefined;
  readonly runs: readonly TextRun[];
  readonly runInputs: readonly OfficeTextRunInput[];
  /** Each run's CSS text shadow ("" for none: `EngineBodyInput.rowShadows`). */
  readonly shadows: readonly string[];
  readonly fontSizeUnit: PresentationFontSizeUnit;
  readonly fontAliases: PresentationFontAliases;
  readonly autofitScale: number;
  readonly colorOverride: string | undefined;
}







const PresentationEngineLine = memo(
  function PresentationEngineLine({ line, lineIndex, row, runs, runInputs, shadows, fontSizeUnit, fontAliases, autofitScale, colorOverride }: EngineLineProps) {
    // Drawn again when glyph outlines a run's outline waits on come.
    useSyncExternalStore(subscribeOfficeTextOutlineGlyphs, officeTextOutlineGlyphsEpoch, officeTextOutlineGlyphsEpoch);
    const shadowId = useId().replace(/[^A-Za-z0-9_-]/g, "");
    const rowStyle = row?.rowTextStyle ?? {};
    const rowPaint = svgTextPaint(rowStyle, colorOverride ?? (rowStyle.color as string | undefined));
    // Highlights, each under the shadow of its stretch: PowerPoint casts a
    // run's text shadow from its highlight box too, under the box, the words'
    // shadow over it (look-fit probe lf13-tshadow, PowerPoint for Windows
    
    const highlightRects: { readonly shadow: string; readonly rect: ReactElement; readonly x0: number; readonly x1: number }[] = [];
    // The line's stretches in order, cut where the text shadow changes: each
    // piece its own text element (every glyph keeps its own x, so the cut
    // moves nothing), drawn under its shadow copy when it casts one.
    const chunks: EngineLineChunk[] = [];
    let bands: ReactElement[] = [];
    let fills: ReactElement[] = [];
    let spans: ReactElement[] = [];
    let underlines: EngineLineChunk["underlines"] = [];
    // Text alignment Top stands runs on baselines of their own: then every
    // stretch states its y (a tspan's y holds for the stretches after it).
    const ownBaselines = line.segments.some((segment) => segment.baseline !== undefined);
    line.segments.forEach((segment, segmentIndex) => {
      const segmentBaseline = segment.baseline ?? line.baseline;
      const segmentY = ownBaselines ? px(segmentBaseline) : undefined;
      if (segment.tab) return;
      const run = runs[segment.run];
      if (!run) return;
      const shadow = shadows[segment.run] ?? "";
      let chunk = chunks[chunks.length - 1];
      if (!chunk || chunk.shadow !== shadow) {
        chunk = { shadow, spans: [], fills: [], bands: [], underlines: [], x0: segment.x, x1: segment.x + segment.width };
        chunks.push(chunk);
        ({ spans, fills, bands, underlines } = chunk);
      }
      chunk.x0 = Math.min(chunk.x0, segment.x);
      chunk.x1 = Math.max(chunk.x1, segment.x + segment.width);
      const caps = runInputs[segment.run]?.allCaps === true;
      const css = row?.runs ? runStyleCss(run.style, fontSizeUnit, fontAliases, autofitScale) : {};
      // Drawn in exactly the face, size, weight and slant the engine measured.
      const measured = runInputs[segment.run]?.font;
      const paint: CSSProperties = {
        ...svgTextPaint(css, colorOverride),
        ...(scriptShiftPt.has(run) ? { baselineShift: px(scriptShiftPt.get(run)!) } : {}),
        ...(measured
          ? { fontFamily: measured.stack, fontSize: px(measured.sizePt), fontWeight: measured.weight, fontStyle: measured.italic ? "italic" : "normal" }
          : {}),
      };
      // A single underline in whole points from the Office face's own
      // metrics, as PowerPoint draws it (lib/text-engine/office-underline.ts).
      const decoration = typeof paint.textDecoration === "string" ? paint.textDecoration : "";
      const underline =
        measured && /\bunderline\b/.test(decoration) && (paint.textDecorationStyle === undefined || paint.textDecorationStyle === "solid")
          ? officeUnderline(measured.stack, measured.weight, measured.italic, measured.sizePt)
          : null;
      if (underline) {
        paint.textDecoration = decoration.replace(/\bunderline\b/, "").trim() || "none";
        const color = String(paint.fill ?? rowPaint.fill ?? "currentColor");
        const top = segmentBaseline + underline.topPt - (scriptShiftPt.get(run) ?? 0);
        const last = underlines[underlines.length - 1];
        if (last && last.color === color && last.top === top && last.height === underline.thicknessPt && Math.abs(last.x1 - segment.x) < 0.5) {
          last.x1 = segment.x + segment.width;
        } else {
          underlines.push({ x0: segment.x, x1: segment.x + segment.width, top, height: underline.thicknessPt, color });
        }
      }
      const highlight = typeof run.style?.highlight === "string" ? run.style.highlight : undefined;
      if (highlight) {
        highlightRects.push({
          shadow,
          x0: segment.x,
          x1: segment.x + segment.width,
          rect: <rect key={`h${segmentIndex}`} x={px(segment.x)} y={px(line.top)} width={px(segment.width)} height={px(line.bottom - line.top)} fill={highlight} />,
        });
      }
      const glyphs = segment.glyphs.filter((glyph) => glyph.text !== "\n");
      const shown = (text: string) => (caps ? text.toUpperCase() : text);
      // A bold the engine measured as synthesized (no declared face of the
      // weight: Calibri Light, Open Sans SemiBold, 宋体 b="1"), where the
      // browser synthesizes none (Chrome on macOS): the faux-bold stroke
      // (lib/office-fonts/faux-bold), 0 wherever the browser emboldens it.
      const firstCode = glyphs.find((glyph) => glyph.text.trim())?.text.codePointAt(0);
      if (measured && paint.stroke === undefined && firstCode !== undefined) {
        Object.assign(paint, engineFauxBoldPaint(measured, firstCode, paint.fill ?? rowPaint.fill));
      }
      // Office's outline: one stroke along each glyph's merged outline,
      // centred and round, over the fill, at the engine's own positions;
      // the text's SVG stroke stands in until every glyph's is kept.
      const outline = outlineOf(css);
      const smallCaps = /small-caps/.test(String(css.fontVariantCaps ?? css.fontVariant ?? ""));
      if (outline && measured && !smallCaps) {
        const sizePx = px(measured.sizePt);
        const placed = glyphs.map((glyph) =>
          glyph.text.trim() ? officeTextOutlineGlyph(shown(glyph.text), measured.stack, measured.weight, measured.italic, sizePx) : "space" as const);
        if (placed.every((glyph) => glyph !== null && glyph !== "pending")) {
          const baseline = px(segmentBaseline - (scriptShiftPt.get(run) ?? 0));
          // Where an installed font draws the words (not the file the band
          // is read from), they are filled from the band's outlines too, and
          // the text's own fill is see-through.
          const fill = placed.some((glyph) => glyph !== "space" && glyph.installed) && typeof (paint.fill ?? rowPaint.fill) === "string" ? String(paint.fill ?? rowPaint.fill) : null;
          placed.forEach((glyph, glyphIndex) => {
            if (glyph === "space" || !glyph.d) return;
            const x = px(glyphs[glyphIndex].x);
            const s = glyph.scale;
            const transform = `matrix(${s} 0 ${glyph.skew * s} ${-s} ${x} ${baseline})`;
            if (fill) fills.push(<path key={`f${segmentIndex}-${glyphIndex}`} d={glyph.d} transform={transform} fill={fill} />);
            bands.push(
              <path key={`o${segmentIndex}-${glyphIndex}`} d={glyph.d} transform={transform}
                fill="none" stroke={outline.color} strokeWidth={(outline.widthPt * PX_PER_PT) / s}
                strokeLinejoin={outline.stroke.join} strokeMiterlimit={outline.stroke.join === "miter" ? outline.stroke.miterLimit : undefined}
                strokeLinecap={outline.stroke.dash ? outline.stroke.cap : "round"}
                strokeDasharray={outline.stroke.dash ? outline.stroke.dash.map((length) => (length * outline.widthPt * PX_PER_PT) / s).join(" ") : undefined} />,
            );
          });
          paint.stroke = "none";
          if (fill) paint.fill = "transparent";
        }
      }
      if (glyphs.every((glyph) => shown(glyph.text).length === 1)) {
        spans.push(
          <tspan key={segmentIndex} data-run-index={segment.run} x={glyphs.map((glyph) => px(glyph.x)).join(" ")} y={segmentY} style={paint}>
            {glyphs.map((glyph) => shown(glyph.text)).join("")}
          </tspan>,
        );
      } else {
        glyphs.forEach((glyph, glyphIndex) => {
          spans.push(
            <tspan key={`${segmentIndex}-${glyphIndex}`} data-run-index={segment.run} x={px(glyph.x)} y={segmentY} style={paint}>
              {shown(glyph.text)}
            </tspan>,
          );
        });
      }
    });
    if (!chunks.some((chunk) => chunk.spans.length)) return null;
    const textStyle = { ...SVG_TEXT_STYLE, ...rowPaint };
    // Consecutive highlights under one shadow, drawn (and cast) together.
    const highlightPieces: { shadow: string; rects: ReactElement[]; x0: number; x1: number }[] = [];
    for (const { shadow, rect, x0, x1 } of highlightRects) {
      const last = highlightPieces[highlightPieces.length - 1];
      if (last && last.shadow === shadow) {
        last.rects.push(rect);
        last.x1 = Math.max(last.x1, x1);
      } else highlightPieces.push({ shadow, rects: [rect], x0, x1 });
    }
    // A drawing under its shadow: the same elements again (`<use>`, no
    // second copy of the words in the page's text) through an SVG drop
    // shadow -- `drop-shadow()`'s offset, blur (a Gaussian of half the
    // radius) and colour, `presentationTextShadowCss`'s own -- under the
    // drawing, which stays unfiltered: a CSS filter on the words themselves
    // makes Chrome print them as a picture, no text left in the PDF.
    // PowerPoint scales a text shadow by the largest drawn size on its line
    // (`powerPointTextShadowScale`): every run of the line casts at that size.
    const lineSizePt = Math.max(0, ...line.segments.map((segment) => (segment.tab ? 0 : runInputs[segment.run]?.font.sizePt ?? 0)));
    const castShadow = (shadow: string, key: string, x0: number, x1: number, drawing: ReactElement): ReactElement => {
      const modelled = shadow.startsWith(ENGINE_SHADOW_BASE_MARK);
      const cast = cssTextShadowParts(modelled ? shadow.slice(ENGINE_SHADOW_BASE_MARK.length) : shadow)
        .map((parts) => (modelled && lineSizePt > 0 ? powerPointTextShadowParts(parts, lineSizePt) : parts));
      if (!cast.length) return <Fragment key={key}>{drawing}</Fragment>;
      const group = `${shadowId}-${key}`;
      const filter = `${shadowId}-${key}-shadow`;
      // The filter's region, in the line's own space: the stretch's box grown
      // by each shadow's offset and three deviations of its blur, and by half
      // the line for strokes and underlines below the line box.
      const reach = Math.max(...cast.map((parts) => Math.abs(parts.x) + Math.abs(parts.y) + 1.5 * parts.blur)) + px(line.bottom - line.top) / 2 + 2;
      return (
        <Fragment key={key}>
          <filter id={filter} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"
            x={px(x0) - reach} y={px(line.top) - reach} width={px(x1 - x0) + 2 * reach} height={px(line.bottom - line.top) + 2 * reach}>
            {cast.map((parts, index) => (
              <Fragment key={index}>
                <feGaussianBlur in="SourceAlpha" stdDeviation={parts.blur / 2} result={`b${index}`} />
                <feOffset in={`b${index}`} dx={parts.x} dy={parts.y} result={`o${index}`} />
                <feFlood floodColor={parts.color} result={`c${index}`} />
                <feComposite in={`c${index}`} in2={`o${index}`} operator="in" result={`s${index}`} />
              </Fragment>
            ))}
            {/* CSS draws a text-shadow list's first shadow on top. */}
            <feMerge>{cast.map((_parts, index) => <feMergeNode key={index} in={`s${cast.length - 1 - index}`} />)}</feMerge>
          </filter>
          <use
            href={`#${group}`}
            filter={`url(#${filter})`}
            aria-hidden="true"
            data-presentation-selection-ignore="true"
            data-testid="presentation-engine-text-shadow"
            style={{ pointerEvents: "none" }}
          />
          <g id={group}>{drawing}</g>
        </Fragment>
      );
    };
    return (
      <g data-testid="presentation-engine-line" data-engine-line={lineIndex}>
        {highlightPieces.map((piece, pieceIndex) => castShadow(piece.shadow, `h${pieceIndex}`, piece.x0, piece.x1, <>{piece.rects}</>))}
        {chunks.map((chunk, chunkIndex) => {
          const drawing = (
            <>
              <text y={px(line.baseline)} style={textStyle}>
                {chunk.spans}
              </text>
              {chunk.fills.length ? <g aria-hidden="true" data-office-text-outline-fill="">{chunk.fills}</g> : null}
              {chunk.bands.length ? <g aria-hidden="true" data-office-text-outline-band="">{chunk.bands}</g> : null}
              {chunk.underlines.map((rule, index) => (
                // PowerPoint's underline is whole points long too.
                <rect key={`u${index}`} data-testid="presentation-engine-underline" x={px(rule.x0)} y={px(rule.top)} width={px(Math.max(1, Math.round(rule.x1 - rule.x0)))} height={px(rule.height)} fill={rule.color} />
              ))}
            </>
          );
          return castShadow(chunk.shadow, `t${chunkIndex}`, chunk.x0, chunk.x1, drawing);
        })}
      </g>
    );
  },
  (a, b) =>
    a.signature === b.signature &&
    a.rowKey === b.rowKey &&
    a.lineIndex === b.lineIndex &&
    a.fontSizeUnit === b.fontSizeUnit &&
    a.fontAliases === b.fontAliases &&
    a.autofitScale === b.autofitScale &&
    a.colorOverride === b.colorOverride,
);

/**
 * The body drawn from an `ok` layout, as SVG text: each run's stretch of
 * each line a `tspan` whose every grapheme stands at the engine's position
 * on the line's baseline -- PowerPoint's 1/8 pt advances, its kerning and
 * its justification, whatever advances the platform's text stack would
 * have used (Chromium on Linux rounds each to a whole pixel: up to 0.37 pt
 * a glyph). The marker of a row stands on its first line.
 */
export function PresentationEngineTextBody({
  answer,
  rows,
  fontSizeUnit,
  fontAliases,
  autofitScale,
  colorOverride,
  overlay = false,
}: {
  answer: Extract<PresentationEngineBodyAnswer, { status: "ok" }>;
  rows: readonly PresentationParagraphRowPlan[];
  fontSizeUnit: PresentationFontSizeUnit;
  fontAliases: PresentationFontAliases;
  autofitScale: number;
  colorOverride?: string;
  /** Drawn over a body's editing rows (`PresentationEngineEditLayer`): the
   * rows are the text the readers read, so this drawing carries none of a
   * row's reading marks, takes no caret and is no part of the body's text. */
  overlay?: boolean;
}): ReactElement {
  const { layout, input } = answer;
  const parts = engineDrawingParts(answer, rows);
  const nodes: ReactElement[] = [];
  layout.paragraphs.forEach((paragraph, rowIndex) => {
    const row = rows[rowIndex];
    const runs = input.rowRuns[rowIndex] ?? [];
    const runInputs = input.paragraphs[rowIndex]?.runs ?? [];
    const rowStyle = row?.rowTextStyle ?? {};
    const firstLine = paragraph.lines[0];
    // The row as the text readers read a drawn row (`presentationPreviewDomPoint`,
    // find highlights): its marker apart, its words in order in one group.
    const markerNodes: ReactElement[] = [];
    if (paragraph.marker && row && firstLine) {
      const markerPaint = presentationEngineMarkerPaint(rowStyle, row.markerCss, colorOverride, input.paragraphs[rowIndex]?.marker?.font);
      if (row.markerPicture) {
        const size = runInputs[0]?.font.sizePt ?? paragraph.lines[0].sizePt;
        markerNodes.push(
          <image
            key={`m${rowIndex}`}
            href={row.markerPicture}
            x={px(paragraph.marker.x)}
            y={px(firstLine.baseline - size * 0.88)}
            width={px(size)}
            height={px(size)}
          />,
        );
      } else if (row.markerText) {
        markerNodes.push(
          <text key={`m${rowIndex}`} aria-hidden="true" data-presentation-selection-ignore="true" data-testid="presentation-paragraph-marker" x={px(paragraph.marker.x)} y={px(firstLine.baseline)} style={{ ...SVG_TEXT_STYLE, ...markerPaint }}>
            {row.markerText}
          </text>,
        );
      }
    }
    const lineNodes = paragraph.lines.map((line, lineIndex) => (
      <PresentationEngineLine
        key={`${rowIndex}-${lineIndex}`}
        signature={parts.lines[rowIndex]?.[lineIndex] ?? ""}
        rowKey={parts.rowKeys[rowIndex] ?? ""}
        line={line}
        lineIndex={lineIndex}
        row={row}
        runs={runs}
        runInputs={runInputs}
        shadows={input.rowShadows?.[rowIndex] ?? []}
        fontSizeUnit={fontSizeUnit}
        fontAliases={fontAliases}
        autofitScale={autofitScale}
        colorOverride={colorOverride}
      />
    ));
    nodes.push(
      overlay ? (
        <g key={rowIndex} data-testid="presentation-engine-paragraph">
          {markerNodes}
          <g>{lineNodes}</g>
        </g>
      ) : (
        <g key={rowIndex} data-testid="presentation-engine-paragraph" data-presentation-paragraph-index={rowIndex}>
          {markerNodes}
          <g data-presentation-paragraph-text="true">{lineNodes}</g>
        </g>
      ),
    );
  });
  // A press on the drawn words finds its character from the engine's lines
  // (`officeTextOffsetAtPoint`): SVG text is no caret target of the body's.
  const registerHits = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) registerOfficeTextHitMap(element, { layout, runLengths: input.rowRuns.map((runs) => runs.map((run) => run.text.length)) });
    },
    [layout, input],
  );
  return (
    <div
      ref={registerHits}
      data-testid={overlay ? "presentation-engine-edit-text" : "presentation-engine-text"}
      {...(overlay
        ? { [OFFICE_TEXT_HIT_ATTRIBUTE]: "", [OFFICE_TEXT_MARKER_ATTRIBUTE]: "", "aria-hidden": true, contentEditable: false, "data-presentation-selection-ignore": "true" }
        : { [PRESENTATION_TEXT_ENGINE_ATTRIBUTE]: "laid", [OFFICE_TEXT_HIT_ATTRIBUTE]: "" })}
      // Never shrunk by the anchoring flex column it stands in: its words are
      // an absolute SVG, so the box had no content height and a body taller
      // than its frame shrank to the frame -- a centred or bottom-anchored
      // body that overflows stood from the frame's top. PowerPoint overflows
      // a centred body both ways and a bottom-anchored one upward (look-fit
      
      style={{ position: "relative", width: "100%", height: px(layout.height), flexShrink: 0, ...(overlay ? { userSelect: "none" as const } : {}) }}
    >
      <EngineSvgRoot testId="presentation-engine-text-svg">{nodes}</EngineSvgRoot>
    </div>
  );
}

/**
 * A body drawn by the engine where it can be, else `fallback` (the
 * browser-flowed drawing) -- for a host whose own render cannot call the
 * engine's hook unconditionally (a shape's label).
 */
export function PresentationEngineOrFallback({
  rows,
  bodyStyle,
  fontSizeUnit,
  autofitScale,
  tabStops,
  defaultTabPx,
  kerning,
  eastAsianLines,
  lineBox,
  markLines,
  flatText,
  flatRuns,
  widthPx,
  wrap,
  colorOverride,
  naturalLines,
  fallback,
}: {
  rows: readonly PresentationParagraphRowPlan[] | null;
  bodyStyle: CSSProperties;
  fontSizeUnit: PresentationFontSizeUnit;
  autofitScale: number;
  tabStops?: unknown;
  defaultTabPx?: unknown;
  kerning?: unknown;
  /** `source.nativeEastAsianLines` (readings row 1001). */
  eastAsianLines?: unknown;
  /** `source.nativeLineBox` (readings row 1013). */
  lineBox?: unknown;
  /** `source.nativeMarkLines` and a flat body's text and runs (readings row 1013, {@link presentationEmptyLineFonts}). */
  markLines?: unknown;
  flatText?: string;
  flatRuns?: unknown;
  widthPx: number | null;
  wrap: boolean;
  colorOverride?: string;
  /** A SmartArt diagram's label (`usePresentationEngineBody`). */
  naturalLines?: boolean;
  fallback: ReactElement;
}): ReactElement {
  const fontAliases = useContext(PresentationFontAliasesContext);
  const engine = usePresentationEngineBody({
    enabled: true,
    rows,
    bodyStyle,
    fontSizeUnit,
    fontAliases,
    autofitScale,
    tabStops,
    defaultTabPx,
    kerning,
    eastAsianLines,
    lineBox,
    markLines,
    flatText,
    flatRuns,
    widthPx,
    wrap,
    naturalLines,
  });
  if (engine.status === "ok" && rows) {
    return (
      <PresentationEngineTextBody
        answer={engine}
        rows={rows}
        fontSizeUnit={fontSizeUnit}
        fontAliases={fontAliases}
        autofitScale={autofitScale}
        colorOverride={colorOverride}
      />
    );
  }
  return engine.status === "pending" ? (
    <>
      <span hidden {...{ [PRESENTATION_TEXT_ENGINE_ATTRIBUTE]: "pending" }} />
      {fallback}
    </>
  ) : (
    fallback
  );
}
