"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { nativeParagraphFontStyle, nativeTextAlignmentOffset, measureNativeLineAdvance, type NativeTextAlignmentBox } from "../../../../lib/spreadsheet/native-text-layout";
import type { NumberFormatLayoutPart } from "@mrnote/core/web/lib/spreadsheet/number-format.ts";
import { nativeTextAdvances, nativeTextPrinterDpi, resolveSpreadsheetTextStyle } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { fontMeasureStamp, spreadsheetEngineTextWidth } from "@mrnote/core/web/lib/spreadsheet/spreadsheet-text-engine.ts";
import { withSheetZoomedFont } from "@mrnote/core/web/lib/css-zoom.ts";
import { fontLoadReach, type FontLoadReach } from "@mrnote/core/web/lib/spreadsheet/font-load-reach.ts";
import { SpreadsheetNativeText, spreadsheetNativeFontCss } from "./SpreadsheetNativeText";

function formatLeadingText(parts: readonly NumberFormatLayoutPart[]): string {
  const first = parts.find(part => part.kind !== "text" || part.text.length > 0);
  return first?.kind === "text" ? first.text : first?.kind === "fill" ? first.character : " ";
}

type FormatMetrics = { signature: string; widths: number[]; repeats: number[]; offset?: number };

/** What each number's parts measured, by everything the measure read. A sheet
 * of accounting cells paged through asked for these again per mounted cell,
 * each on a canvas of its own and through a style recalculation: 20 page
 * downs spent 1.9 s here. */
const measuredFormats = new Map<string, FormatMetrics>();
const MAX_MEASURED_FORMATS = 20_000;
let measuringCanvas: HTMLCanvasElement | null = null;

/** Whether a font load can change what a formatted number's parts measure
 * in `style` (font-load-reach). */
export function formattedTextTouchedBy(reach: FontLoadReach, parts: readonly NumberFormatLayoutPart[], style: CSSProperties, dpi?: number): boolean {
  const text = parts.map((part) => (part.kind === "text" ? part.text : part.character)).join("");
  const family = resolveSpreadsheetTextStyle(style, text, dpi).fontFamily;
  return reach.touches(typeof family === "string" ? family : undefined, text);
}

let measuredFormatsListening = false;


function listenForFormatFonts(): void {
  if (measuredFormatsListening || typeof document === "undefined") return;
  measuredFormatsListening = true;
  document.fonts?.addEventListener("loadingdone", (event) => {
    const reach = fontLoadReach(event);
    if (!reach) return;
    for (const key of [...measuredFormats.keys()]) {
      try {
        const [parts, style, dpi] = JSON.parse(key.split("\u0000")[0]!) as [NumberFormatLayoutPart[], CSSProperties, number | null];
        if (formattedTextTouchedBy(reach, parts, style, dpi ?? undefined)) measuredFormats.delete(key);
      } catch {
        measuredFormats.delete(key);
      }
    }
  });
}

function measuredKey(signature: string, inherited: number, available: number): string {
  listenForFormatFonts();
  // The printer's advances are another measure of the same parts.
  return `${signature}\u0000${inherited}\u0000${available}\u0000${fontMeasureStamp()}\u0000${nativeTextPrinterDpi()}`;
}

/** Number-format layout, shared by the normal grid and Page Layout. The
 * operators remain view-only: editing/copying/export still use cell values. */
export function SpreadsheetFormattedText({ parts, style, dpi, scale = 1, wrap = false, layoutWidth, alignmentBox }: {
  parts: readonly NumberFormatLayoutPart[]; style: CSSProperties; dpi?: number; scale?: number; wrap?: boolean; layoutWidth?: number; alignmentBox?: NativeTextAlignmentBox;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const signature = JSON.stringify([parts, style, dpi, scale, wrap, layoutWidth, alignmentBox]);
  const hasFill = parts.some(part => part.kind === "fill");
  const leadingStyle = resolveSpreadsheetTextStyle(style, formatLeadingText(parts), dpi);
  // Known without reading the element: a stated size, and a width from the
  // caller where a fill needs one. Taken here, the cell renders once.
  const knownKey = typeof document !== "undefined" && typeof leadingStyle.fontSize === "number" && (!hasFill || layoutWidth != null)
    ? measuredKey(signature, Number.NaN, hasFill ? layoutWidth! * scale : 0) : null;
  const known = knownKey ? measuredFormats.get(knownKey) : undefined;
  const [measurement, setMeasurement] = useState<FormatMetrics | undefined>(known);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    fontMeasureStamp();
    // The signature is JSON, so an absent width or box comes back as null.
    const [stableParts, stableStyle, parsedDpi, stableScale, stableWrap, stableWidth, parsedBox] = JSON.parse(signature) as [NumberFormatLayoutPart[], CSSProperties, number | null, number, boolean, number | null, NativeTextAlignmentBox | null];
    const stableDpi = parsedDpi ?? undefined;
    const stableBox = parsedBox ?? undefined;
    let cancelled = false;
    const update = async () => {
      // Reading fonts.ready lays the page out; it is awaited only while a
      // font is actually loading.
      if (document.fonts?.status === "loading") await document.fonts.ready;
      if (cancelled) return;
      const leading = resolveSpreadsheetTextStyle(stableStyle, formatLeadingText(stableParts), stableDpi);
      // A cell at the sheet's default size carries no font size and paints
      // at the size it inherits; it is measured at that size, not at the 12px
      // a font string falls back to (live audit S-035: measured a fifth too
      // narrow, the fill pushed the currency symbol out of the cell).
      const inherited = typeof leading.fontSize !== "number" ? parseFloat(getComputedStyle(node).fontSize) / stableScale : Number.NaN;
      // Without a layout width the fill takes the cell's own width (live
      // audit S-035: an absent width read as 0 left every accounting fill
      // empty, so the currency symbol rode against the number).
      const available = !stableParts.some(part => part.kind === "fill") ? 0
        : stableWidth == null ? parseFloat(getComputedStyle(node).width) : stableWidth * stableScale;
      const key = measuredKey(signature, inherited, available);
      const held = measuredFormats.get(key);
      if (held) {
        setMeasurement(previous => previous === held ? previous : held);
        return;
      }
      const resolved = Number.isFinite(inherited) && inherited > 0 ? { ...leading, fontSize: inherited } : leading;
      const font = spreadsheetNativeFontCss(resolved);
      const canvasFont = spreadsheetNativeFontCss({ ...resolved, fontSize: typeof resolved.fontSize === "number" ? resolved.fontSize * stableScale : resolved.fontSize });
      let measuredOnCanvas = true;
      const measureOnCanvas = (text: string) => {
        const context = (measuringCanvas ??= document.createElement("canvas")).getContext("2d");
        if (!context) {
          measuredOnCanvas = false;
          return 0;
        }
        context.font = canvasFont;
        return context.measureText(text).width;
      };
      const measure = (text: string, purpose: "measure" | "paint") => {
        const advances = stableDpi ? nativeTextAdvances(text, font, stableDpi, stableScale, purpose) : undefined;
        return advances?.every(run => run.advance !== undefined)
          ? advances.reduce((sum, run) => sum + (run.advance ?? 0), 0)
          : spreadsheetEngineTextWidth(text, canvasFont) ?? measureOnCanvas(text);
      };
      // Native wrapped number formatting materializes `_x` as a space.
      // Without wrapping it reserves x on the native device grid, including
      // substituted fonts. Measured across six font/size/trait combinations.
      // Printed, Windows Excel leaves x's advance at the printer, whole
      // dots at the printer's pixels per em, as it sets the digits beside it
      // (lookwin p195-lw: 游ゴシック Medium 9 leaves 21 dots for `_ ` and 28
      // for `_)`, Calibri 11 21 and 28, where the screen's 3 px and 5 px
      // are 18.75 and 31.25: the 17 游ゴシック books' numbers printed 0.3 pt
      // right of Excel's under `#,##0_ ` and 0.4 pt left under `#,##0_)`).
      const reservePurpose = nativeTextPrinterDpi() ? "paint" : "measure";
      const widths = stableParts.map(part => part.kind === "text" ? measure(part.text, "paint")
        : measure(part.kind === "reserve" && stableWrap ? " " : part.character,
          part.kind === "reserve" && !stableWrap ? reservePurpose : "paint"));
      if (!measuredOnCanvas) return;
      const used = widths.reduce((sum, width, index) => sum + (stableParts[index].kind === "fill" ? 0 : width), 0);
      // A fill is an integer count of glyphs, not a stretched CSS gap. The
      // original logical cell width avoids fractional DOM layout rounding
      // adding or removing a complete repeated character at print zoom.
      const repeats = stableParts.map((part, index) => part.kind === "fill" && widths[index] > 0
        ? Math.max(0, Math.min(32767, Math.floor((available - used + 1e-7) / widths[index]))) : 0);
      const advance = stableDpi && stableBox ? stableParts.reduce((sum, part, index) => sum + (part.kind === "text"
        ? measureNativeLineAdvance([{ text: part.text, fontLeadingText: formatLeadingText(stableParts) }], resolved, stableDpi) ?? NaN
        : widths[index] * (part.kind === "fill" ? repeats[index] : 1) / stableScale), 0) : undefined;
      // A fill spans the cell, so the line is not aligned within it.
      const offset = stableDpi && !stableParts.some(part => part.kind === "fill")
        ? nativeTextAlignmentOffset(advance, resolved.textAlign, stableBox, stableDpi, stableScale) : undefined;
      const next = { signature, widths, repeats, offset };
      if (measuredFormats.size >= MAX_MEASURED_FORMATS) measuredFormats.clear();
      measuredFormats.set(key, next);
      setMeasurement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    void update();
    const observer = new ResizeObserver(() => { void update(); });
    observer.observe(node);
    stableParts.forEach((part, index) => {
      if (part.kind === "fill") observer.observe(node.children[index]);
    });
    // Measured again only for a load that reaches this number's text.
    const fontsLoaded = (event: Event) => {
      const reach = fontLoadReach(event);
      if (reach && !formattedTextTouchedBy(reach, stableParts, stableStyle, stableDpi)) return;
      void update();
    };
    document.fonts?.addEventListener("loadingdone", fontsLoaded);
    return () => { cancelled = true; observer.disconnect(); document.fonts?.removeEventListener("loadingdone", fontsLoaded); };
  }, [signature]);
  const metrics = measurement?.signature === signature ? measurement : known;
  const leadingText = formatLeadingText(parts);
  const resolved = leadingStyle;
  const paint = (text: string) => dpi ? <SpreadsheetNativeText text={text} style={resolved} dpi={dpi} scale={scale} fontLeadingText={leadingText} /> : text;
  return <span ref={root} data-spreadsheet-number-layout="" style={{ display: "flex", alignItems: "baseline", justifyContent: metrics?.offset !== undefined ? "flex-start" : resolved.textAlign === "right" || resolved.textAlign === "end" ? "flex-end" : resolved.textAlign === "center" ? "center" : "flex-start", position: metrics?.offset !== undefined ? "relative" : undefined, left: metrics?.offset, width: "100%", minWidth: 0, lineHeight: "normal", whiteSpace: "pre", ...withSheetZoomedFont(nativeParagraphFontStyle(resolved, scale)), color: resolved.color, textDecorationLine: resolved.textDecorationLine, textDecorationStyle: resolved.textDecorationStyle, textDecorationThickness: resolved.textDecorationThickness }}>
    {parts.map((part, index) => part.kind === "text"
      ? <span key={index} style={{ flex: "0 0 auto" }}>{paint(part.text)}</span>
      : part.kind === "reserve"
        ? <span key={index} data-number-format-reserve={part.character} style={{ flex: "0 0 auto", width: metrics?.widths[index] ?? 0 }} />
        // A blank fill (the accounting formats' `* `) takes exactly the room
        // left, so the symbol stays at the cell's left edge down a column
        // whatever the number's width; a visible fill repeats whole glyphs.
        : <span key={index} data-number-format-fill={part.character} style={{ ...(part.character.trim() ? { flex: "0 0 auto", width: metrics ? metrics.widths[index] * metrics.repeats[index] : 0 } : { flex: "1 1 0", minWidth: 0 }), overflow: "hidden", position: "relative", alignSelf: "stretch" }}>
          {part.character.trim() && metrics ? <span style={{ position: "absolute", inset: 0 }}>{paint(part.character.repeat(metrics.repeats[index]))}</span> : null}
        </span>)}
  </span>;
}
