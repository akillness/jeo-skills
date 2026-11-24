/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx, pxToPt } from "@mrnote/core/web/lib/office-units.ts";
import { SPREADSHEET_DEFAULT_FONT_PT, spreadsheetPtToPx, type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { nativeFontSizeCss } from "@mrnote/core/web/lib/spreadsheet/native-font-size.ts";
import { fontMeasureContext, type NativeGrid } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { spreadsheetFontStackWithAssets, spreadsheetFontFamilyWithAssets } from "./useSpreadsheetFontFaces";
import { type CSSProperties } from "react";
import { resolveThemeStyle } from "@mrnote/core/web/lib/spreadsheet/theme-colors.ts";
import { fitNumberText } from "../../../../lib/spreadsheet/general-number-fit";
import { CELL_BASE_PADDING_X_PX, effectiveVerticalAlign, SPREADSHEET_WRAP_LINE_HEIGHT, horizontalAlignToCss, cellIndentInsetsPx, cellVerticalSpread, resolveBorderCss, resolveDiagonalCss, dashDotEdgeLayers, type CellBackgroundLayer, shrinkToFitCss, shrinkToFitFontScale, verticalAlignToCss } from "@mrnote/core/web/lib/spreadsheet/cell-format.ts";
import { cellUnderlineIsDouble, DOUBLE_UNDERLINE_THICKNESS } from "@mrnote/core/web/lib/spreadsheet/cell-text-effects.ts";
import { estimateTextWidthPx } from "../../../../lib/spreadsheet/text-spill";
import { SHEET_PATTERN_PRINT_FILL, spreadsheetFillPatternCss, spreadsheetFillPatternPrintColor, spreadsheetGradientFillCss } from "@mrnote/core/web/lib/spreadsheet/fill-pattern.ts";
import { cssFontFamilyOrUndefined } from "@mrnote/core/web/lib/css-font-family.ts";
import { excelCutFamilyEmboldens } from "@mrnote/core/web/lib/office-fonts/excel-cut-families.ts";
import { ensureOfficeFauxBoldProbe, officeFamilyHasNoBold } from "@mrnote/core/web/lib/office-fonts/faux-bold.ts";
import { officeDigitWidth } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { officePrimaryFontFamily } from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import { fontMeasureStamp, spreadsheetEngineTextWidth, spreadsheetExcelAutoFitTextWidth, spreadsheetFauxBoldCss, spreadsheetTextEngineEpoch, spreadsheetTextEngineOn } from "@mrnote/core/web/lib/spreadsheet/spreadsheet-text-engine.ts";
import { fontLoadReach } from "@mrnote/core/web/lib/spreadsheet/font-load-reach.ts";

// The grid's default on-screen size (matches the pinned CSS base above).
export const SPREADSHEET_DEFAULT_FONT_SIZE = spreadsheetPtToPx(
  SPREADSHEET_DEFAULT_FONT_PT,
);

/**
 * Bold in an Office family with no bold face (宋体, 黑体, MS Gothic ...):
 * Office emboldens the regular; a browser that does not synthesize bold
 * gets a stroke instead (lib/office-fonts/faux-bold, X-057). Inherited by
 * the cell's display, spill and multi-line layers.
 */
/** Excel sets cell text without kerning or ligatures; with the text engine
 * on, the grid draws it that way too, so a measured width is the drawn one.
 * Nor does Excel close up two full-width punctuation marks that meet: the
 * browser's own trimming (text-spacing-trim: normal, where the font has the
 * half-width forms -- Noto Sans JP, SC, KR) set 「に、「建物」」 half an em
 * short at every such pair, a width no measurement had (R447-X72's notes
 * printed 9 pt short of Excel's over two pairs). */
function engineTextCss(): CSSProperties {
  return spreadsheetTextEngineOn() ? { fontKerning: "none", fontVariantLigatures: "none", textSpacingTrim: "space-all" } : { textSpacingTrim: "space-all" };
}

function fauxBoldCss(fontFamily: string | undefined): CSSProperties {
  if (!officeFamilyHasNoBold(fontFamily) && !excelCutFamilyEmboldens(fontFamily)) return {};
  ensureOfficeFauxBoldProbe();
  return spreadsheetFauxBoldCss();
}

type CellStyleCssContext = readonly [
  themeFontFamily: string | undefined,
  themeHeadingFontFamily: string | undefined,
  themePaletteId: string | undefined,
  nativeDefault: (NativeGrid["font"] & { currentTheme?: boolean }) | undefined,
  fontAliases: Readonly<Record<string, string>> | undefined,
  textEngine: boolean,
];

/** The CSS of a style object, by the context it was built in. Styles are
 * immutable and a tile's cells share them, so a screen of a thousand cells
 * builds a dozen of these, once, instead of one a cell on every render. The
 * answer is shared: callers spread it, none may write to it. */
const stylesCss = new WeakMap<object, { context: CellStyleCssContext; css: CSSProperties }[]>();

const tablePaintCss = new Map<string, CSSProperties>();

/** {@link cellStyleCss} of a table style's paint: a new object per cell in a
 * handful of looks, so it is told apart by what it says. */
export function tableCellPaintCss(paint: Parameters<typeof cellStyleCss>[0]): CSSProperties {
  const key = JSON.stringify(paint);
  let css = tablePaintCss.get(key);
  if (!css) {
    if (tablePaintCss.size >= 2_000) tablePaintCss.clear();
    css = cellStyleCss(paint);
    tablePaintCss.set(key, css);
  }
  return css;
}

export function cellStyleCss(
  style: SpreadsheetCell["style"] | undefined,
  themeFontFamily?: string,
  themeHeadingFontFamily?: string,
  themePaletteId?: string,
  nativeDefault?: NativeGrid["font"] & { currentTheme?: boolean },
  fontAliases?: Readonly<Record<string,string>>,
): CSSProperties {
  if (!style) return buildCellStyleCss(style, themeFontFamily, themeHeadingFontFamily, themePaletteId, nativeDefault, fontAliases);
  const context: CellStyleCssContext = [themeFontFamily, themeHeadingFontFamily, themePaletteId, nativeDefault, fontAliases, spreadsheetTextEngineOn()];
  let known = stylesCss.get(style);
  if (!known) stylesCss.set(style, known = []);
  const hit = known.find((entry) => entry.context.every((part, index) => part === context[index]));
  if (hit) return hit.css;
  const css = buildCellStyleCss(style, themeFontFamily, themeHeadingFontFamily, themePaletteId, nativeDefault, fontAliases);
  // A window's context and the plain one; a theme change replaces the rest.
  if (known.length >= 4) known.shift();
  known.push({ context, css });
  return css;
}

function buildCellStyleCss(
  style: SpreadsheetCell["style"] | undefined,
  themeFontFamily?: string,
  themeHeadingFontFamily?: string,
  themePaletteId?: string,
  nativeDefault?: NativeGrid["font"] & { currentTheme?: boolean },
  fontAliases?: Readonly<Record<string,string>>,
): CSSProperties {
  if (!style) {
    if (!nativeDefault) return themeFontFamily ? { fontFamily: spreadsheetFontFamilyWithAssets(themeFontFamily,fontAliases) } : {};
    const defaultFamily = spreadsheetFontFamilyWithAssets(spreadsheetFontStackWithAssets(nativeDefault.family,fontAliases,nativeDefault),fontAliases);
    return { fontFamily: defaultFamily, fontSize: ptToPx(nativeDefault.sizePt), ...engineTextCss(), ...(nativeDefault.bold ? { fontWeight: 700, ...fauxBoldCss(defaultFamily) } : {}), ...(nativeDefault.italic ? { fontStyle: "italic" } : {}) };
  }
  style = resolveThemeStyle(style, themePaletteId);
  const wrap = Boolean(style.wrapText);
  const fillPattern = spreadsheetFillPatternCss(style.fillPattern);
  // A cell carries one fill. A pattern wins where a file somehow has both,
  // matching the order SpreadsheetML itself allows them in.
  const gradientFill = fillPattern
    ? undefined
    : spreadsheetGradientFillCss(style.gradientFill);
  // The diagonal rule is not a box edge; it rides as a background layer ON TOP
  // of whatever fill the cell has, so a split header shows over its own shading.
  const diagonal = resolveDiagonalCss(style);
  // Named cell styles (Title / Heading 1-4) carry a numeric `fontSize` (px).
  // Only honor a finite positive number so a malformed stored value can't break
  // layout; any other shape falls back to the grid's default size.
  const fontSize =
    typeof style.fontSize === "number" &&
    Number.isFinite(style.fontSize) &&
    style.fontSize > 0
      ? nativeFontSizeCss(style.fontSize, style.nativeFontSize)
      : nativeDefault ? ptToPx(nativeDefault.sizePt) : undefined;
  // Font family (Excel "Font" picker / an imported workbook's face name).
  // The import path stores Excel's raw face — "等线", "Calibri Light" — which
  // is NOT limited to any UI whitelist, so two things matter here:
  //  - QUOTE the face and strip quote/backslash/semicolon/brace characters, so
  //    a malformed stored value cannot terminate the declaration and inject
  //    CSS (the old code passed the raw string straight through);
  //  - append the app's own CJK-capable stack behind it. A bare unknown face
  //    made the BROWSER pick the fallback per glyph, and its default CJK face
  //    draws characters like the fullwidth dash (U+FF0D) with wide side
  //    bearings — that is why "Mon－27" rendered with air around the dash
  //    while WPS drew it tight.
  const storedFace =
    typeof style.fontFamily === "string" ? style.fontFamily.trim() : "";
  const safeFace = storedFace
    .replace(/["'\\;{}()]/g, "")
    .slice(0, 200)
    .trim();
  const fontFamily = spreadsheetFontFamilyWithAssets(safeFace
    ? spreadsheetFontStackWithAssets(safeFace,fontAliases,style)
    : style.themeFontRole === "heading"
      ? nativeDefault?.headingFamily && !nativeDefault.currentTheme ? spreadsheetFontStackWithAssets(nativeDefault.headingFamily,fontAliases,style) : (themeHeadingFontFamily ?? themeFontFamily)
      // An explicit default face does not follow the theme: a styled cell
      // that states no font keeps it, exactly as an unstyled one does.
      : style.themeFontRole !== "body" && nativeDefault && !nativeDefault.themeRole ? spreadsheetFontStackWithAssets(nativeDefault.family,fontAliases,{ bold: style.bold, italic: style.italic, record: nativeDefault.record })
      : nativeDefault && !nativeDefault.currentTheme ? spreadsheetFontStackWithAssets(nativeDefault.bodyFamily ?? nativeDefault.family,fontAliases,style) : themeFontFamily,fontAliases);
  // Strikethrough composes with underline: Excel lets a cell be both, so the
  // text-decoration line list carries whichever flags are set.
  const decorations: string[] = [];
  if (style.underline) decorations.push("underline");
  if (style.strikethrough) decorations.push("line-through");
  const fillCss = fillPattern ?? gradientFill;
  const backgroundImage = fillCss?.backgroundImage ?? "";
  // Dash-dot edges are background strips over the fill (live audit B428).
  const dashDot = dashDotEdgeLayers(style);
  // The diagonal runs corner to corner of the whole cell, once: laid out on
  // the border box without repeating. As a repeating padding-box layer its
  // next tile showed through the gridline border as a stub at the corners
  // (R08_bootstrap33, X-150).
  const diagonalLayers: CellBackgroundLayer[] = diagonal
    ? splitCssList(diagonal.backgroundImage).map((image) => ({ image, size: "100% 100%", position: "0 0", origin: "border-box" }))
    : [];
  const overLayers = [...dashDot.layers, ...diagonalLayers];
  const layered = overLayers.length > 0 ? cellBackgroundWithEdgeLayers(overLayers, backgroundImage, fillCss) : null;
  // The printed page sets a pattern as its one mixed colour
  // (`printPatternFillsAsInk`); a cell with edge or diagonal layers keeps it.
  const patternPrintFill = fillPattern && !layered ? spreadsheetFillPatternPrintColor(style.fillPattern) : undefined;
  return Object.fromEntries(Object.entries({
    ...(fillCss ?? {}),
    ...(backgroundImage ? { backgroundImage } : {}),
    ...(layered ?? {}),
    ...(patternPrintFill ? { [SHEET_PATTERN_PRINT_FILL]: patternPrintFill } : {}),
    backgroundColor:
      fillPattern?.backgroundColor ||
      gradientFill?.backgroundColor ||
      style.backgroundColor ||
      undefined,
    color: style.color || undefined,
    fontSize,
    fontFamily,
    fontWeight: style.bold ? 700 : undefined,
    ...(style.bold ? fauxBoldCss(fontFamily) : {}),
    fontStyle: style.italic ? "italic" : undefined,
    ...engineTextCss(),
    textDecorationLine:
      decorations.length > 0 ? decorations.join(" ") : undefined,
    // A double rule (plain or accounting). The weight rides on its own key
    // so a plain underline stays byte-identical to what it was; the display
    // layer turns an accounting rule into one across the whole cell.
    textDecorationStyle: cellUnderlineIsDouble(style)
      ? ("double" as const)
      : undefined,
    textDecorationThickness: cellUnderlineIsDouble(style)
      ? DOUBLE_UNDERLINE_THICKNESS
      : undefined,
    textAlign: horizontalAlignToCss(style.textAlign),
    verticalAlign: verticalAlignToCss(style.verticalAlign),
    // Wrapped cells break onto multiple lines and show the overflow; unwrapped
    // cells keep the single-line clip behaviour (the default grid CSS).
    whiteSpace: wrap ? "normal" : undefined,
    overflow: wrap ? "visible" : undefined,
    overflowWrap: wrap ? "anywhere" : undefined,
    // Borders draw a darker box/edges over the faint grid lines. The legacy
    // `border` boolean is the full box ("all"); per-side flags drive "outline".
    ...gridBorderCss(resolveBorderCss(style)),
    ...dashDot.borders,
  }).filter(([, value]) => value !== undefined));
}

/**
 * A stated 1px edge as the collapsed grid draws it: style `double`, which a
 * browser paints solid below 3px but which outranks `solid` where edges meet.
 * A cell's unstated edge is a solid line in its fill or the faint gridline;
 * at a corner where it met a stated thin edge of the same width the unstated
 * one could win, so a vertical rule showed a 1px notch at every row boundary
 * no horizontal edge crossed (K30_DuplicateImageNames, X-117). Copied HTML
 * and pictures keep `resolveBorderCss`'s solid spelling.
 */
function gridBorderCss<T extends Record<string, string | undefined>>(css: T): T {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(css)) {
    out[key] = typeof value === "string" && value.startsWith("1px solid ") ? `1px double ${value.slice("1px solid ".length)}` : value;
  }
  return out as T;
}

/** Split a CSS list at its top-level commas (not those inside a function). */
function splitCssList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (value.trim()) parts.push(value.slice(start).trim());
  return parts;
}

/**
 * The cell's background with edge strips laid on top: every layer list spelled
 * out per layer, the fill's own size and position kept for its layers (a CSS
 * list shorter than the images repeats, so it is expanded the same way).
 */
function cellBackgroundWithEdgeLayers(
  edges: readonly CellBackgroundLayer[],
  backgroundImage: string,
  // A pattern's CSS carries a tile size and offset; a gradient's carries
  // neither (both are accepted, the layers cycle "auto" for the gradient).
  fillCss:
    | { backgroundSize?: string; backgroundPosition?: string; backgroundImage?: string; backgroundColor?: string }
    | undefined,
): { backgroundImage: string; backgroundSize: string; backgroundPosition: string; backgroundRepeat: string; backgroundOrigin: string } {
  const images = splitCssList(backgroundImage);
  const cycle = (list: string | undefined, fallback: string) => {
    const parts = list ? splitCssList(list) : [];
    return images.map((_, index) => (parts.length > 0 ? parts[index % parts.length] : fallback));
  };
  return {
    backgroundImage: [...edges.map((edge) => edge.image), ...images].join(", "),
    backgroundSize: [...edges.map((edge) => edge.size), ...cycle(fillCss?.backgroundSize, "auto")].join(", "),
    backgroundPosition: [...edges.map((edge) => edge.position), ...cycle(fillCss?.backgroundPosition, "0 0")].join(", "),
    backgroundRepeat: [...edges.map(() => "no-repeat"), ...images.map(() => "repeat")].join(", "),
    backgroundOrigin: [...edges.map((edge) => edge.origin ?? "padding-box"), ...images.map(() => "padding-box")].join(", "),
  };
}

export { CELL_BASE_PADDING_X_PX };

/**
 * The style a cell's EDITOR lays its text out with: the cell's own, less its
 * orientation. Turned or stacked text is edited as a horizontal entry (Excel),
 * placed by the cell's vertical alignment like any other entry; only the
 * display layer turns it.
 */
export function cellEditorStyle(
  style: SpreadsheetCell["style"] | undefined,
): SpreadsheetCell["style"] | undefined {
  if (!style || (style.textRotation === undefined && style.verticalText === undefined)) return style;
  const level = { ...style };
  delete level.textRotation;
  delete level.verticalText;
  return level;
}

/**
 * INPUT-ONLY style extras (indent, shrink-to-fit). These apply to the cell's
 * `<input>` (its editor and hit target) and NOT the `<td>` — the `<td>`
 * carries the fill/border/alignment. Returns `{}` for a plain cell so the input
 * renders byte-for-byte as before.
 *
 *  - indent   → extra leading padding on the input, layered on the base 9px.
 *  - shrink-to-fit → keep the run on one line and clip it to the cell (Excel
 *    shrinks the font; the on-screen approximation clips rather than wraps).
 *
 * Orientation is NOT here. Turned or stacked text is drawn by the display
 * layer, the one element that turns (`textOrientationCss`); the editor is an
 * ordinary horizontal entry over the cell, as Excel edits turned text. The
 * input used to turn too, and as it wears the cell's fill, a turned copy of
 * the fill stood beside the level one on the cell -- a 90° cell's fill became
 * a bar down the column, its text unturned beside it when a rich layer drew
 * it -- and the turned box took the clicks of the cells it crossed.
 */
// The vertical alignment a cell renders with (bottom when unset) lives with
// the pure cell-format helpers, so the pictures of a range resolve it as the
// grid does; re-exported for the grid's existing imports.
export { effectiveVerticalAlign };

/**
 * Where an open multi-line entry stands in its cell, as the wrapped-text layer
 * draws the lines it was opened from. Vertical Justify / Distributed spread
 * the cell's paragraphs over its height; the soft-wrapped lines of one
 * paragraph stay together, at the top (Justify: the first paragraph keeps the
 * top) or the middle (Distributed: the room is shared above and below). The
 * entry's text area cannot spread anything, so it takes that place; as the
 * cell's bottom default it stood at the bottom while the cell drew it at the
 * top.
 */
export function cellEditorVerticalAlign(
  style: SpreadsheetCell["style"] | undefined,
): "top" | "middle" | "bottom" {
  const spread = cellVerticalSpread(style);
  if (spread === "justify") return "top";
  if (spread === "distributed") return "middle";
  return effectiveVerticalAlign(style);
}

/**
 * Where a cell's editor stands inside the text layers that draw the cell, so
 * the text sits on the same pixels shown and edited. The layers fill the cell
 * from half a pixel inside its collapsed borders; the editor is a pixel
 * shorter and the cell places it by its vertical alignment: flush with the
 * layers' top when top-aligned, half a pixel lower otherwise.
 */
export function cellTextLayerInsetY(
  style: SpreadsheetCell["style"] | undefined,
): { top: number; bottom: number } {
  return effectiveVerticalAlign(style) === "top"
    ? { top: 0, bottom: 1 }
    : { top: 0.5, bottom: 0.5 };
}

/**
 * Vertical alignment for the plain single-line `<input>` cell.
 *
 * A browser always centres an input's text in the control's own content box,
 * and the grid's inputs fill the whole cell — so CSS `vertical-align` on them
 * moves nothing (measured: top/middle/bottom rendered byte-identically). The
 * only lever that works on an input is padding: pinning the line box's height
 * with an explicit line-height and padding the leftover row height above (for
 * bottom) or below (for top) puts the text where the alignment says. Compact
 * rows also clamp that line box so the caret cannot cross the cell border.
 *
 * Skipped for rotated text, whose transform already owns the box geometry.
 */
export function cellVerticalAlignCss(
  style: SpreadsheetCell["style"] | undefined,
  rowHeightPx: number,
): CSSProperties {
  const align = effectiveVerticalAlign(style);
  if (style?.textRotation || style?.verticalText) return {};
  const fontSize =
    typeof style?.fontSize === "number" &&
    Number.isFinite(style.fontSize) &&
    style.fontSize > 0
      ? style.fontSize
      : SPREADSHEET_DEFAULT_FONT_SIZE;
  // Keep the line box inside compact rows. Without this clamp the browser's
  // inherited 20px line-height plus bottom-alignment padding can place the
  // insertion caret on top of (or beyond) a 20px cell border.
  const lineHeight = Math.min(
    Math.ceil(fontSize * 1.3),
    Math.max(1, Math.floor(rowHeightPx) - 2),
  );
  const lineHeightCss = `${lineHeight}px`;
  if (align === "middle") return { lineHeight: lineHeightCss };
  // 2px breathing room mirrors the cell's own top/bottom inset so "bottom"
  // hugs the border the way Excel draws it without touching it.
  const spare = Math.max(0, rowHeightPx - lineHeight - 2);
  if (spare === 0) return { lineHeight: lineHeightCss };
  return align === "bottom"
    ? { paddingTop: spare, lineHeight: lineHeightCss }
    : { paddingBottom: spare, lineHeight: lineHeightCss };
}

/**
 * Where a cell's icon-set icon sits down the cell: on the text line, as Excel
 * places it, so a bottom-aligned value in a tall row has its icon beside it at
 * the bottom (r52 complex-fidelity G6, X-233) and a top-aligned one at the
 * top. The box is the line box `cellVerticalAlignCss` gives the text, the
 * icon centred in it; `undefined` (the whole cell, centred) for a middle
 * alignment, turned text, or a row no taller than its line.
 */
export function conditionalIconBoxCss(
  style: SpreadsheetCell["style"] | undefined,
  rowHeightPx: number,
): CSSProperties | undefined {
  const align = effectiveVerticalAlign(style);
  if (align === "middle" || style?.textRotation || style?.verticalText) return undefined;
  const line = Number.parseFloat(String(cellVerticalAlignCss(style, rowHeightPx).lineHeight ?? ""));
  if (!Number.isFinite(line) || line + 2 >= rowHeightPx) return undefined;
  return align === "bottom"
    ? { top: "auto", bottom: 1, height: line }
    : { top: 1, bottom: "auto", height: line };
}

/**
 * Formula-source editing deliberately does not inherit a presentation cell's
 * display typography. A KPI formula can be 40–60px, bold and centred across a
 * merged block; its raw `=...` source needs an ordinary worksheet editor while
 * the formula bar carries the same source text. Literal text editing keeps the
 * presentation style and therefore uses cellVerticalAlignCss instead.
 */
export function cellInlineFormulaEditorCss(cellHeightPx: number): CSSProperties {
  const controlHeight = Math.max(1, Math.floor(cellHeightPx) - 2);
  const lineHeight = Math.min(
    Math.ceil(SPREADSHEET_DEFAULT_FONT_SIZE * 1.3),
    controlHeight,
  );
  const bottomInset = Math.min(2, Math.max(0, controlHeight - lineHeight));
  const topInset = Math.max(0, controlHeight - lineHeight - bottomInset);
  return {
    color: "var(--console-text-primary, #183c38)",
    fontFamily: "var(--font-body)",
    fontSize: SPREADSHEET_DEFAULT_FONT_SIZE,
    fontStyle: "normal",
    fontWeight: 400,
    lineHeight: `${lineHeight}px`,
    paddingTop: topInset,
    paddingBottom: bottomInset,
    textAlign: "left",
    whiteSpace: "nowrap",
  };
}

/**
 * Text-only subset of the resolved cell style. The cell itself continues to
 * own fills and borders; the display layer owns only glyph styling, which keeps
 * imported font/colour/emphasis fidelity without painting a second cell box.
 */
export function cellDisplayTextCss(style: CSSProperties): CSSProperties {
  return {
    color: style.color,
    fontFamily: cssFontFamilyOrUndefined(style.fontFamily),
    fontSize: style.fontSize,
    fontStyle: style.fontStyle,
    fontWeight: style.fontWeight,
    textAlign: style.textAlign,
    textDecorationLine: style.textDecorationLine,
    textDecorationStyle: style.textDecorationStyle,
    textDecorationThickness: style.textDecorationThickness,
  };
}

// One shared 2D context for text measurement (shrink-to-fit). Created lazily
// so SSR/jsdom paths that never measure pay nothing; measureText on a detached
// canvas is ~1µs, cheap enough to run per shrink-marked cell per render.
let measureCtx: CanvasRenderingContext2D | null | undefined;
function measureTextWidthPx(
  text: string,
  fontSizePx: number,
  bold: boolean,
  italic: boolean,
  familyCss: string,
  effectiveFontStyle?: CSSProperties,
): number | null {
  if (measureCtx === undefined) {
    measureCtx =
      typeof document !== "undefined"
        ? (document.createElement("canvas").getContext("2d") ?? null)
        : null;
    // The widths a font load can change go (font-load-reach); the measure
    // stamp in the key moves only for a load that names no faces.
    if (typeof document !== "undefined") {
      document.fonts?.addEventListener("loadingdone", (event) => {
        const reach = fontLoadReach(event);
        if (!reach) return;
        for (const key of [...measuredTextWidths.keys()]) {
          const [, font = "", ...text] = key.split("\u0000");
          if (reach.touchesFont(font, text.join("\u0000"))) measuredTextWidths.delete(key);
        }
      });
    }
  }
  const font = measureFontCss(fontSizePx, bold, italic, familyCss, effectiveFontStyle);
  const key = `${fontMeasureStamp()}\u0000${font}\u0000${text}`;
  const known = measuredTextWidths.get(key);
  if (known !== undefined) return known;
  // The served font files' widths (lib/text-engine), the same in every
  // browser, where the engine knows the faces; else the browser's.
  let width = spreadsheetEngineTextWidth(text, font);
  if (width === undefined) {
    // A context kept in this font: cells of different fonts interleave, and
    // switching one shared context's font made each new text resolve the
    // face again.
    const context = measureCtx ? fontMeasureContext(font) : null;
    if (!context) return null;
    width = context.measureText(text).width;
  }
  if (measuredTextWidths.size >= MAX_MEASURED_TEXT_WIDTHS) measuredTextWidths.clear();
  measuredTextWidths.set(key, width);
  return width;
}

/** Widths by text and font: a sheet shows the same strings many times over. */
const measuredTextWidths = new Map<string, number>();
const MAX_MEASURED_TEXT_WIDTHS = 20_000;

function measureFontCss(fontSizePx: number, bold: boolean, italic: boolean, familyCss: string, effectiveFontStyle?: CSSProperties): string {
  return `${effectiveFontStyle?.fontStyle ?? (italic ? "italic" : "normal")} ${effectiveFontStyle?.fontWeight ?? (bold ? 700 : 400)} ${fontSizePx}px ${familyCss}`;
}

// Canvas cannot resolve var(--font-body); the measurement stack spells out the
// same faces the grid inherits so the measured width tracks the painted one.
const SHRINK_MEASURE_STACK =
  '"Plus Jakarta Sans", "Noto Sans SC", "PingFang SC", sans-serif';

/**
 * The fitted font-size for a shrink-to-fit cell, or undefined when the text
 * already fits (or nothing can be measured — jsdom — in which case the cell
 * keeps today's clip-only behaviour). This is the caller shrinkToFitFontScale
 * was written for: the helper existed, was unit-tested, and was wired to
 * nothing, so "Shrink to fit" only ever clipped.
 */
export function shrinkToFitFontSizePx(
  style: SpreadsheetCell["style"] | undefined,
  displayText: string,
  cellWidthPx: number,
  fontAliases?: Readonly<Record<string,string>>,
  effectiveFontStyle?: CSSProperties,
  // The side padding the display layer draws the text inside: an imported
  // sheet on its native grid has Excel's 2px, not the stylesheet's 9px, and
  // fitting into the narrower box shrank the text well past Excel's (X-327).
  sidePaddingPx: number = CELL_BASE_PADDING_X_PX,
): number | undefined {
  if (!style?.shrinkToFit || style.wrapText || !displayText) return undefined;
  const fontSize = typeof effectiveFontStyle?.fontSize === "number" && Number.isFinite(effectiveFontStyle.fontSize) && effectiveFontStyle.fontSize > 0
    ? effectiveFontStyle.fontSize :
    typeof style.fontSize === "number" &&
    Number.isFinite(style.fontSize) &&
    style.fontSize > 0
      ? style.fontSize
      : SPREADSHEET_DEFAULT_FONT_SIZE;
  const face = effectiveFontStyle?.fontFamily ?? (
    typeof style.fontFamily === "string" && style.fontFamily.trim()
      ? spreadsheetFontStackWithAssets(style.fontFamily,fontAliases,style)
      : SHRINK_MEASURE_STACK);
  const width = measureTextWidthPx(
    displayText,
    fontSize,
    Boolean(style.bold),
    Boolean(style.italic),
    spreadsheetFontFamilyWithAssets(face,fontAliases) ?? face,
    effectiveFontStyle,
  );
  if (width === null) return undefined;
  const available = cellWidthPx - 2 * sidePaddingPx;
  const scale = shrinkToFitFontScale(width, available);
  if (scale >= 1) return undefined;
  // Excel keeps whole/half sizes; round down so the fitted text never clips.
  return Math.max(4, Math.floor(fontSize * scale * 2) / 2);
}

/**
 * The rendered width of a cell's text for the SPILL decision: real canvas
 * metrics where the browser provides them, the deterministic estimate
 * elsewhere (jsdom), so the decision never flips between environments for
 * clear-cut cases.
 */
export function spillTextWidthPx(
  text: string,
  style: SpreadsheetCell["style"] | undefined,
  fontAliases?: Readonly<Record<string,string>>,
  effectiveFontStyle?: CSSProperties,
): number {
  if (!text) return 0;
  const fontSize = typeof effectiveFontStyle?.fontSize === "number" && Number.isFinite(effectiveFontStyle.fontSize) && effectiveFontStyle.fontSize > 0
    ? effectiveFontStyle.fontSize :
    typeof style?.fontSize === "number" &&
    Number.isFinite(style.fontSize) &&
    style.fontSize > 0
      ? style.fontSize
      : SPREADSHEET_DEFAULT_FONT_SIZE;
  const face = effectiveFontStyle?.fontFamily ?? (
    typeof style?.fontFamily === "string" && style.fontFamily.trim()
      ? spreadsheetFontStackWithAssets(style.fontFamily,fontAliases,style)
      : SHRINK_MEASURE_STACK);
  const measured = measureTextWidthPx(
    text,
    fontSize,
    Boolean(style?.bold),
    Boolean(style?.italic),
    spreadsheetFontFamilyWithAssets(face,fontAliases) ?? face,
    effectiveFontStyle,
  );
  return measured ?? estimateTextWidthPx(text, fontSize);
}

/**
 * The text width AutoFit Column Width gives a cell of an imported workbook,
 * as Excel for Mac fits it: each glyph's advance at the point size rounded to
 * a whole 72-dpi device pixel, plus 12 such pixels, read as a
 * column width in characters and put on the grid's own 96-dpi digit (so the
 * stored width is Excel's). Never narrower than the text as drawn here.
 * Measured: README of lib/text-engine, "AutoFit". Undefined when the text
 * engine is off or cannot measure the text.
 */
export function excelAutoFitTextWidthPx(
  text: string,
  style: SpreadsheetCell["style"] | undefined,
  fontAliases: Readonly<Record<string,string>> | undefined,
  effectiveFontStyle: CSSProperties | undefined,
  grid: { readonly normalFont: { readonly family: string; readonly sizePt: number }; readonly digitWidth: number; readonly paddingPx: number },
): number | undefined {
  if (!text) return undefined;
  const fontSize = typeof effectiveFontStyle?.fontSize === "number" && Number.isFinite(effectiveFontStyle.fontSize) && effectiveFontStyle.fontSize > 0
    ? effectiveFontStyle.fontSize
    : typeof style?.fontSize === "number" && Number.isFinite(style.fontSize) && style.fontSize > 0 ? style.fontSize : SPREADSHEET_DEFAULT_FONT_SIZE;
  const face = effectiveFontStyle?.fontFamily ?? (
    typeof style?.fontFamily === "string" && style.fontFamily.trim()
      ? spreadsheetFontStackWithAssets(style.fontFamily,fontAliases,style)
      : SHRINK_MEASURE_STACK);
  const font = measureFontCss(fontSize, Boolean(style?.bold), Boolean(style?.italic), spreadsheetFontFamilyWithAssets(face,fontAliases) ?? face, effectiveFontStyle);
  return spreadsheetExcelAutoFitTextWidth(text, font, grid);
}

/**
 * Excel's digit width over the browser's, in the cell's look
 * (general-number-fit): a number that fits in Excel fits here. Excel's
 * digit is the workbook grid's maximum digit width for a cell in the Normal
 * font (the Latin face its digits are drawn in, whatever East Asian face a
 * theme adds -- P22_DataTableCities' Calibri digits under a 宋体 Hans theme),
 * else its own face's; the browser's is measured in the face it draws with,
 * a substitute included (Noto Serif SC is wider than 宋体's half-em digits,
 * so the face's nominal advance inflated every fit, X-101).
 */
function numberFitDigitPx(
  style: SpreadsheetCell["style"] | undefined,
  effectiveFontStyle?: CSSProperties,
  fontAliases?: Readonly<Record<string,string>>,
  gridDigitPx?: number,
): number {
  const fontSize = typeof effectiveFontStyle?.fontSize === "number" && Number.isFinite(effectiveFontStyle.fontSize) && effectiveFontStyle.fontSize > 0
    ? effectiveFontStyle.fontSize
    : typeof style?.fontSize === "number" && Number.isFinite(style.fontSize) && style.fontSize > 0
      ? style.fontSize
      : SPREADSHEET_DEFAULT_FONT_SIZE;
  const stack = typeof effectiveFontStyle?.fontFamily === "string" ? effectiveFontStyle.fontFamily : style?.fontFamily;
  const family = typeof stack === "string" ? officePrimaryFontFamily(stack) : "";
  const ownFont =
    (typeof style?.fontFamily === "string" && style.fontFamily.trim() !== "") ||
    (typeof style?.fontSize === "number" && Number.isFinite(style.fontSize));
  const excelDigit =
    !ownFont && typeof gridDigitPx === "number" && Number.isFinite(gridDigitPx) && gridDigitPx > 0
      ? gridDigitPx
      : officeDigitWidth({ family: family || "Calibri", sizePt: pxToPt(fontSize) });
  return excelDigit;
}

// The drawn text of a number, per value, format kind, width and font: the
// fit is measured only once per distinct cell look, however often the grid
// renders (a virtualised scroll re-renders the same rows many times).
const numberFitCache = new Map<string, string>();
/**
 * The text a number cell draws in its column (general-number-fit): General
 * rounds or goes scientific within 11 characters, any other format shows #
 * when it does not fit. Measured in the cell's own font.
 */
export function fittedCellNumberText(
  value: number,
  display: string,
  general: boolean,
  availablePx: number,
  style: SpreadsheetCell["style"] | undefined,
  fontAliases?: Readonly<Record<string,string>>,
  effectiveFontStyle?: CSSProperties,
  /** The workbook grid's maximum digit width (its Normal font's), px. */
  gridDigitPx?: number,
  /** How wide a candidate is drawn, px, where the caller knows (the print
   * page: at the printer's advances); else Excel's digits and the browser's
   * reading of the rest. */
  drawnWidthPx?: (text: string) => number | undefined,
  /** The printed fit's #### room (the cell less one #) and its 0 for a
   * General number too small to show (fitNumberText's hashAvailablePx). */
  hashAvailablePx?: number,
  /** Tells apart two callers' drawnWidthPx in the cache (the printed General
   * fit counts every character a digit wide). */
  drawnKey = "",
): string {
  const key = [
    Math.floor(availablePx), general ? "g" : "f", value, display, gridDigitPx ?? "", drawnWidthPx ? `drawn${drawnKey}` : "",
    hashAvailablePx === undefined ? "" : Math.floor(hashAvailablePx),
    effectiveFontStyle?.fontFamily ?? style?.fontFamily ?? "", effectiveFontStyle?.fontSize ?? style?.fontSize ?? "",
    effectiveFontStyle?.fontWeight ?? (style?.bold ? 700 : 400), effectiveFontStyle?.fontStyle ?? (style?.italic ? "i" : ""),
    spreadsheetTextEngineEpoch(),
  ].join("|");
  const cached = numberFitCache.get(key);
  if (cached !== undefined) return cached;
  // Judged at Excel's digit width, not the browser's (X-101): each digit at
  // Excel's, the rest (point, separators, signs) as drawn -- scaling them by
  // the digits' ratio made "." narrower than Excel's, so General kept one
  // digit too many ("0.6666667" where Excel shows "0.666667", X-143).
  const digitPx = numberFitDigitPx(style, effectiveFontStyle, fontAliases, gridDigitPx);
  const text = fitNumberText({
    value,
    display,
    general,
    availablePx,
    measure: (candidate) => {
      const drawn = drawnWidthPx?.(candidate);
      if (drawn !== undefined && Number.isFinite(drawn)) return drawn;
      const digits = (candidate.match(/[0-9]/g) ?? []).length;
      const rest = candidate.replace(/[0-9]/g, "");
      return digits * digitPx + (rest ? spillTextWidthPx(rest, style, fontAliases, effectiveFontStyle) : 0);
    },
    ...(hashAvailablePx !== undefined ? { hashAvailablePx } : {}),
  });
  if (numberFitCache.size >= 20_000) numberFitCache.clear();
  numberFitCache.set(key, text);
  return text;
}

/**
 * Excel's horizontal room around a cell's text: 2px each side and the 1px
 * gridline (ECMA-376 Part 1, 18.3.1.13 col: width = characters x digit
 * width + 5 pixels of padding). A number fits when it fits in the rest.
 */
export const EXCEL_CELL_TEXT_MARGINS_PX = 5;

// The drawn width of a fitted number, per text and cell look (cached as the
// fit is: the grid asks again on every render of a mounted row).
const numberWidthCache = new Map<string, number>();
/** The width a number cell's fitted text takes in its own font. */
export function fittedCellNumberWidthPx(
  text: string,
  style: SpreadsheetCell["style"] | undefined,
  fontAliases?: Readonly<Record<string,string>>,
  effectiveFontStyle?: CSSProperties,
): number {
  const key = [
    text,
    effectiveFontStyle?.fontFamily ?? style?.fontFamily ?? "", effectiveFontStyle?.fontSize ?? style?.fontSize ?? "",
    effectiveFontStyle?.fontWeight ?? (style?.bold ? 700 : 400), effectiveFontStyle?.fontStyle ?? (style?.italic ? "i" : ""),
    spreadsheetTextEngineEpoch(),
  ].join("|");
  const cached = numberWidthCache.get(key);
  if (cached !== undefined) return cached;
  const width = spillTextWidthPx(text, style, fontAliases, effectiveFontStyle);
  if (numberWidthCache.size >= 20_000) numberWidthCache.clear();
  numberWidthCache.set(key, width);
  return width;
}

/**
 * How a wrapped cell's text lays out, for AutoFit Row Height.
 *
 * Microsoft Support, "Change the column width and row height": AutoFit Row
 * Height fits the row to its contents, and a row's height is its text's. The
 * row therefore has to be the wrapped lines' own height plus Excel's small
 * padding, which needs the same two numbers the grid draws with: the glyph
 * widths of the cell's font (so the line COUNT is the one on screen, not a
 * per-character estimate that over-counts proportional text) and the 1.15 line
 * box the wrapped-text layer renders each line in.
 */
// The constant lives with the pure cell-format helpers (the pictures of a
// range stack their lines at the same pitch); re-exported for the grid.
export { SPREADSHEET_WRAP_LINE_HEIGHT };
const SPREADSHEET_WRAP_ROW_PADDING_PX = 3;
export function spreadsheetWrapMetrics(
  style: SpreadsheetCell["style"] | undefined,
  fontAliases?: Readonly<Record<string, string>>,
): {
  lineHeightPx: number;
  verticalPaddingPx: number;
  fontSizePx: number;
  measure: (segment: string) => number;
} {
  const fontSize =
    typeof style?.fontSize === "number" &&
    Number.isFinite(style.fontSize) &&
    style.fontSize > 0
      ? style.fontSize
      : SPREADSHEET_DEFAULT_FONT_SIZE;
  return {
    lineHeightPx: fontSize * SPREADSHEET_WRAP_LINE_HEIGHT,
    verticalPaddingPx: SPREADSHEET_WRAP_ROW_PADDING_PX,
    fontSizePx: fontSize,
    measure: (segment: string) =>
      spillTextWidthPx(segment, style, fontAliases),
  };
}

/**
 * baseCellStyle minus every border key. The <td> draws the cell's border; the
 * <input> inside it must NOT draw it again — it did, and every bordered cell
 * rendered as a box inside a box (a doubled outline with a white gap, scaled
 * up by the sheet zoom). The visual styles (font, colors, alignment) still
 * apply to the input, where the text actually lives.
 *
 * The same holds for the edges drawn as background strips (dash-dot, hair
 * and dotted rules, diagonals: the `no-repeat` layers of
 * cellBackgroundWithEdgeLayers): the input sits half a pixel inside the
 * cell, and its copy of a 1px dotted strip there blurred into a solid line
 * over the cell's own (X-290: CR086's hair boxes had solid sides and a
 * doubled top). The fill's own layers stay.
 */
export function withoutBorderCss(style: CSSProperties): CSSProperties {
  const {
    border: _b,
    borderTop: _bt,
    borderRight: _br,
    borderBottom: _bb,
    borderLeft: _bl,
    ...rest
  } = style;
  const repeat = typeof rest.backgroundRepeat === "string" ? splitCssList(rest.backgroundRepeat) : [];
  if (typeof rest.backgroundImage !== "string" || !repeat.includes("no-repeat")) return rest;
  const keep = repeat.map((value) => value !== "no-repeat");
  const kept = (value: unknown) =>
    typeof value === "string" ? splitCssList(value).filter((_, index) => keep[index] ?? true).join(", ") : value;
  if (!keep.some(Boolean)) {
    const plain = { ...rest };
    delete plain.backgroundImage;
    delete plain.backgroundSize;
    delete plain.backgroundPosition;
    delete plain.backgroundRepeat;
    delete plain.backgroundOrigin;
    return plain;
  }
  return {
    ...rest,
    backgroundImage: kept(rest.backgroundImage) as string,
    backgroundSize: kept(rest.backgroundSize) as string,
    backgroundPosition: kept(rest.backgroundPosition) as string,
    backgroundRepeat: kept(rest.backgroundRepeat) as string,
    backgroundOrigin: kept(rest.backgroundOrigin) as string,
  };
}

export function cellInputExtraCss(
  style: SpreadsheetCell["style"] | undefined,
  hasValue: boolean,
  // The side padding the display layer draws this sheet's text with. An
  // imported workbook laid out on its native grid uses Excel's own cell
  // padding, narrower than the stylesheet's 9px; the editor must start its
  // text where the display layer does or the text jumps sideways when editing
  // starts. A sheet on the default padding keeps the stylesheet's value, so
  // its inputs render byte-for-byte as before.
  basePaddingPx: number = CELL_BASE_PADDING_X_PX,
  // One indent level, px: an imported grid's is its Normal font's three
  // spaces (ResolvedNativeGrid.indentStepPx).
  indentStepPx?: number,
): CSSProperties {
  const out: CSSProperties = {};
  if (basePaddingPx !== CELL_BASE_PADDING_X_PX) {
    out.paddingLeft = basePaddingPx;
    out.paddingRight = basePaddingPx;
  }
  if (!style) return out;
  // The indent sits on the side the text is aligned to (XLS-A039).
  const indent = cellIndentInsetsPx(style, indentStepPx);
  if (indent.left > 0) out.paddingLeft = basePaddingPx + indent.left;
  if (indent.right > 0) out.paddingRight = basePaddingPx + indent.right;
  Object.assign(out, shrinkToFitCss(style));
  // Center Across Selection: the anchor's text is centered and allowed to spill
  // rightward over the (blank) neighbour cells WITHOUT merging them. We only
  // change the visual when the anchor actually holds a value; an empty anchor
  // renders normally. Overflow is made visible so the centered run can extend
  // past the cell's own width into the adjacent blanks (Excel's look).
  if (style.centerAcross && hasValue) {
    out.textAlign = "center";
    out.whiteSpace = "nowrap";
    out.overflow = "visible";
    // A small positive z so the spilled text draws over the neighbours' empty
    // inputs rather than being clipped beneath them.
    out.position = "relative";
    out.zIndex = 1;
  }
  return out;
}
