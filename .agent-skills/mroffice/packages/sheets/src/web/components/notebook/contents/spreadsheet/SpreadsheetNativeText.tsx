"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, memo, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { nativeTextAdvances, nativeTypographyGeneration, subscribeNativeTypography, spreadsheetFontStack, resolveSpreadsheetFontStyle, spreadsheetFontAvailable, resolveSpreadsheetTextStyle } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { officePrimaryFontFamily } from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import { sheetZoomedFontSize } from "@mrnote/core/web/lib/css-zoom.ts";
import { spreadsheetTextEngineEpoch } from "@mrnote/core/web/lib/spreadsheet/spreadsheet-text-engine.ts";
import { nativeTextFontLead, resolveRelativePartFontSizes, type NativeTextPart } from "../../../../lib/spreadsheet/native-text-layout";
import { nativeTextPrinterDpi } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { OFFICE_ARABIC_STRETCH_FAMILY, officeArabicNaturalWidth, officeArabicStretchPieces, officeArabicStretchScale } from "../../../../lib/spreadsheet/office-arabic-stretch";

function nativeDeclaredGlyphs(text: string, family: CSSProperties["fontFamily"], dpi: number) {
  if (dpi !== 72 || typeof family !== "string" || !/[\u0300-\u036f]/u.test(text)) return text;
  const primary = officePrimaryFontFamily(family);
  // Native available-face drawing and absent-face fallback are distinct:
  // preserve fallback composition rather than forcing raw marks into it.
  if (!primary || spreadsheetFontAvailable(primary) !== true) return text;
  return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), ({segment}, index) => {
    if (!/^\p{Script=Latin}[\u0300-\u036f]+$/u.test(segment)) return segment;
    const [base, ...marks] = Array.from(segment);
    return <span key={index} data-native-declared-mark-cluster="" style={{display:"inline-block",whiteSpace:"nowrap"}}>
      {base}{marks.map((mark, i) => <span key={i} style={{display:"inline-block",width:0,letterSpacing:0,fontFamily:`"${primary}", "Arial", ${family}`}}>{mark}</span>)}
    </span>;
  });
}

/** The right-to-left mark set on each side of a stretched word: an inline
 * block is a neutral to the line's bidi order, the marks keep it Arabic. */
const RLM = String.fromCharCode(0x200f);

/**
 * A Calibri cell's Arabic words as the API's writer prints them
 * (office-arabic-stretch): each in Noto Sans Arabic at the cell's size,
 * spread to Windows Calibri's width of it -- a box that wide holding the word
 * scaled across from its start. `text` as it is where the face sets no Arabic
 * of its own or the face the words are drawn in has not arrived.
 */
function nativeArabicGlyphs(text: string, style: CSSProperties, dpi: number, scale: number): ReactNode | undefined {
  if (dpi !== 96 || typeof style.fontSize !== "number") return undefined;
  const family = typeof style.fontFamily === "string" ? officePrimaryFontFamily(style.fontFamily) : undefined;
  const weight = style.fontWeight ?? 400;
  const bold = typeof weight === "number" ? weight >= 600 : weight === "bold" || Number(weight) >= 600;
  // Printed at the printer's whole dots on the print page, as Excel prints.
  const printer = nativeTextPrinterDpi();
  const pieces = officeArabicStretchPieces(text, family, bold, style.fontSize, printer > 96 ? printer : 96);
  if (!pieces) return undefined;
  const fontStyle = typeof style.fontStyle === "string" ? style.fontStyle : "normal";
  let stretched = false;
  const nodes = pieces.map((piece, index) => {
    if (piece.kind === "plain") return <Fragment key={index}>{piece.text}</Fragment>;
    const stretch = officeArabicStretchScale(piece.width, officeArabicNaturalWidth(piece.text, fontStyle, weight, style.fontSize as number));
    if (stretch === undefined) return <Fragment key={index}>{piece.text}</Fragment>;
    stretched = true;
    return <Fragment key={index}>{RLM}<span data-office-arabic-stretch="" style={{display:"inline-block",width:sheetZoomedFontSize(piece.width*scale),
      whiteSpace:"nowrap",letterSpacing:0,lineHeight:0,direction:"ltr",textAlign:"left",textIndent:0,verticalAlign:"baseline"}}>
      <span style={{display:"inline-block",fontFamily:`"${OFFICE_ARABIC_STRETCH_FAMILY}", ${String(style.fontFamily ?? "sans-serif")}`,direction:"rtl",
        transform:`scaleX(${stretch.toFixed(4)})`,transformOrigin:"0 0"}}>{piece.text}</span></span>{RLM}</Fragment>;
  });
  return stretched ? nodes : undefined;
}

export function spreadsheetNativeFontCss(style: CSSProperties) {
  style = resolveSpreadsheetFontStyle(style);
  return `${style.fontStyle ?? "normal"} ${style.fontWeight ?? 400} ${typeof style.fontSize === "number" ? `${style.fontSize}px` : style.fontSize ?? "12px"} ${style.fontFamily ?? spreadsheetFontStack(undefined)}`;
}

/** Graphemes that share a spacing are one run: `letter-spacing` follows
 * every character of an element alike, so the glyphs land where a span each
 * put them. */
function nativeSpacingRuns(runs: ReadonlyArray<{ text: string; spacing: number }>) {
  const merged: Array<{ text: string; spacing: number }> = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.spacing === run.spacing) last.text += run.text;
    else merged.push({ text: run.text, spacing: run.spacing });
  }
  return merged;
}

/** The spacing most of the text takes. The element carries it, so those
 * characters are plain text in it and only the others need a span of their
 * own: a cell of digits is two or three nodes, not one per character. */
function nativeBaseSpacing(runs: ReadonlyArray<{ text: string; spacing: number }>) {
  const weight = new Map<number, number>();
  let base = runs[0]?.spacing ?? 0, most = 0;
  for (const run of runs) {
    const total = (weight.get(run.spacing) ?? 0) + run.text.length;
    weight.set(run.spacing, total);
    if (total > most) { most = total; base = run.spacing; }
  }
  return base;
}

/** `partStyle` is a formatting run's own style (colour, weight, decoration):
 * the run and its glyphs then share this one element instead of nesting. */
export type NativeTextProps = {text:string;style:CSSProperties;dpi:number;scale?:number;advanceOffset?:number;fontLeadingText?:string;partStyle?:CSSProperties;
  /** Letter spacing added to every character on top of the native advances,
   * px (a number condensed to its cell's room, S-200). */
  squeeze?:number};

/** What the native advances add to a text's plain width in this style, px:
 * the device-pixel spacing its characters are drawn with. */
export function spreadsheetNativeTextSpacingPx(text: string, style: CSSProperties, dpi: number): number {
  // Every number cell asks on every render of its row; the answer depends
  // only on the font fields read below, the text, the grid and what the
  // fonts and the text engine measure with.
  const generation = `${nativeTypographyGeneration()}|${spreadsheetTextEngineEpoch()}`;
  if (spacingCacheGeneration !== generation) {
    spacingCache.clear();
    spacingCacheGeneration = generation;
  }
  const key = `${text}\u0000${dpi}\u0000${String(style.fontStyle ?? "")}\u0000${String(style.fontWeight ?? "")}\u0000${String(style.fontSize ?? "")}\u0000${String(style.fontFamily ?? "")}`;
  const cached = spacingCache.get(key);
  if (cached !== undefined) return cached;
  const resolvedStyle = resolveSpreadsheetTextStyle(style, text, dpi);
  const spacing = nativeTextAdvances(text, spreadsheetNativeFontCss(resolvedStyle), dpi, 1, "measure")
    .reduce((total, run) => total + run.spacing * Array.from(run.text).length, 0);
  if (spacingCache.size >= 20_000) spacingCache.clear();
  spacingCache.set(key, spacing);
  return spacing;
}
const spacingCache = new Map<string, number>();
let spacingCacheGeneration = "";
/** The width a text is drawn at in this style, px: the sum of its native
 * advances (the widths the native layout sets each glyph at); undefined when
 * the layout cannot give every glyph one (bidi text, no canvas). "paint":
 * the advances it is painted at, on the print page the printer's (or a
 * designed line's design widths: setNativeTextPrinterDpi), where "measure"
 * is the screen's, which lines break at. */
export function spreadsheetNativeTextWidthPx(text: string, style: CSSProperties, dpi: number,
  purpose: "paint" | "measure" = "measure"): number | undefined {
  const resolvedStyle = resolveSpreadsheetTextStyle(style, text, dpi);
  let width = 0;
  for (const run of nativeTextAdvances(text, spreadsheetNativeFontCss(resolvedStyle), dpi, 1, purpose)) {
    if (typeof run.advance !== "number" || !Number.isFinite(run.advance)) return undefined;
    width += run.advance;
  }
  return width;
}
/** The font generation each drawn text was measured under (by its props). */
const measuredUnder = new WeakMap<NativeTextProps, number>();
function sameStyle(a: CSSProperties | undefined, b: CSSProperties | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key as keyof CSSProperties], b[key as keyof CSSProperties]));
}
/** The same text in the same style, measured since the last font arrived:
 * the glyph runs it draws are the ones already in the DOM. A row drawn again
 * for an edit elsewhere builds a new style object for every cell. */
function sameNativeText(previous: NativeTextProps, next: NativeTextProps): boolean {
  return measuredUnder.get(previous) === nativeTypographyGeneration() &&
    previous.text === next.text && previous.dpi === next.dpi && previous.scale === next.scale &&
    previous.advanceOffset === next.advanceOffset && previous.fontLeadingText === next.fontLeadingText && previous.squeeze === next.squeeze &&
    sameStyle(previous.style, next.style) && sameStyle(previous.partStyle, next.partStyle);
}
/**
 * What a native text draws: its span's style and its glyph runs. A caller
 * that already holds a box in exactly this font (a native paragraph's single
 * line) can draw them in that box, one element less.
 */
export function spreadsheetNativeTextPaint(props: NativeTextProps): { style: CSSProperties; children: ReactNode } {
  const {text,style,dpi,scale=1,advanceOffset=0,fontLeadingText,partStyle,squeeze=0} = props;
  const resolvedStyle = resolveSpreadsheetTextStyle(style, fontLeadingText ?? text, dpi);
  const font = spreadsheetNativeFontCss(resolvedStyle);
  const runs = nativeSpacingRuns(nativeTextAdvances(text,font,dpi,scale,"paint",advanceOffset));
  const base = nativeBaseSpacing(runs);
  // Native screen-copy vectors retain per-character positions. Available
  // faces paint decomposed Latin marks independently at the base glyph end.
  // A run's own bold in a family without a bold face carries its own faux
  // bold stroke (a whole bold cell's comes from its container); a regular run
  // in such a bold cell drops it (X-268).
  const partStroke = partStyle
    ? resolvedStyle.WebkitTextStrokeWidth !== undefined
      ? { WebkitTextStrokeWidth: resolvedStyle.WebkitTextStrokeWidth, ...(resolvedStyle.fontSynthesis ? { fontSynthesis: resolvedStyle.fontSynthesis } : {}) }
      : partStyle.fontWeight !== undefined ? { WebkitTextStrokeWidth: 0 } : {}
    : {};
  return {
    style: {...partStyle,...partStroke,fontFamily:resolvedStyle.fontFamily,fontStyle:resolvedStyle.fontStyle,fontSize:sheetZoomedFontSize(typeof resolvedStyle.fontSize==="number"?resolvedStyle.fontSize*scale:resolvedStyle.fontSize),fontKerning:"none",letterSpacing:base*scale+squeeze},
    children: runs.map((run,index)=>{
      const glyphs=nativeArabicGlyphs(run.text,resolvedStyle,dpi,scale)??nativeDeclaredGlyphs(run.text,resolvedStyle.fontFamily,dpi);
      return run.spacing===base
        ?<Fragment key={index}>{glyphs}</Fragment>
        :<span key={index} style={{letterSpacing:run.spacing*scale+squeeze}}>{glyphs}</span>;
    }),
  };
}
const serverTypographyGeneration = () => 0;
export const SpreadsheetNativeText = memo(function SpreadsheetNativeText(props: NativeTextProps) {
  // Measured again when a font arrives (subscribeNativeTypography).
  const generation = useSyncExternalStore(subscribeNativeTypography, nativeTypographyGeneration, serverTypographyGeneration);
  measuredUnder.set(props, generation);
  const paint = spreadsheetNativeTextPaint(props);
  return <span data-spreadsheet-native-text="" style={paint.style}>{paint.children}</span>;
}, sameNativeText);

/** Formatting runs share one line origin. Restarting the fractional layout
 * grid for every run accumulates drift even when only its color changes.
 * Used by both paragraph layout and the inline rich-text fallback.
 */
export function SpreadsheetNativeTextParts({parts:givenParts,style,dpi,scale=1}: {
  parts:readonly NativeTextPart[];style:CSSProperties;dpi:number;scale?:number;
}) {
  const parts=resolveRelativePartFontSizes(givenParts,style);
  let offset=0;
  const children:ReactNode[]=[];
  for(let index=0;index<parts.length;index++){
    const part=parts[index];
    const resolved=resolveSpreadsheetTextStyle({...style,...part.style},nativeTextFontLead(part),dpi);
    const start=offset;
    if(index<parts.length-1){
      const advances=nativeTextAdvances(part.text,spreadsheetNativeFontCss(resolved),dpi,scale,"paint",start);
      offset=advances.some(run=>run.advance===undefined)?0:offset+advances.reduce((total,run)=>total+(run.advance??0),0);
    }
    children.push(<SpreadsheetNativeText key={index} text={part.text} style={resolved} dpi={dpi} scale={scale} advanceOffset={start} fontLeadingText={nativeTextFontLead(part)} partStyle={part.style}/>);
  }
  return <>{children}</>;
}
