/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What each row of a text body draws: its marker, its resolved paragraph
 * style, its indentation and the marker's box. One plan for both drawings of
 * a body -- the browser-flowed rows (`PresentationParagraphList`) and the
 * rows the text engine lays out line by line (`PresentationEngineTextBody`)
 * -- so the two never read a row differently.
 *
 * Moved out of `PresentationParagraphList.tsx` (no behaviour change).
 */

import type { CSSProperties } from "react";
import { CSS_PX_PER_POINT } from "@mrnote/core/web/lib/presentation/text-units.ts";
import type { NativeListIndent, NativeParagraphMetrics } from "@mrnote/core/web/lib/native-drawing-geometry.ts";
import { ensureOfficeFontFaces, ensureOfficeScaledScriptFamily, officeFontMetricMatchesWidths, officeFontSubstitution } from "@mrnote/core/web/lib/office-fonts/substitutes.ts";
import symbolShapeCoverage from "@mrnote/core/web/lib/office-fonts/symbol-shapes/coverage.json";
import {
  type NativeBulletMarker,
  nativeBulletGlyph,
  normalizeBlockBulletChar,
  normalizeNumberFormat,
  normalizeParagraphEastAsianLines,
  normalizeParagraphNativeKerning,
  type ParagraphEastAsianLines,
  paragraphEndLineFontSize,
  renderParagraphs,
} from "@mrnote/core/web/lib/presentation-paragraphs.ts";
import { normalizeRuns, type TextRun } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import type { SlideParagraphWithRuns } from "@mrnote/core/web/lib/presentation-text-buttons.ts";
import type { PresentationFontAliases } from "@mrnote/core/web/lib/presentation-font-faces.ts";
import { presentationFontFamilyWithAssets } from "@mrnote/core/web/lib/presentation-font-face-reads.ts";
import { powerPointBulletFace } from "@mrnote/core/web/lib/office-fonts/powerpoint-script-fallbacks.ts";
import { declaredFaces } from "@mrnote/core/web/lib/text-engine/face-index.ts";
import { faceMetrics } from "@mrnote/core/web/lib/text-engine/face-metrics.ts";
import {
  IMPORTED_PPTX_NORMAL_LINE_HEIGHT,
  AUTOFIT_EMU_PER_PX,
  runStyleCss,
  PARAGRAPH_INDENT_EM,
  paragraphOwnIndentCss,
  officePercentLeadingCss,
  officePercentLeadingTailCss,
  paragraphRowTextStyle,
  type PresentationFontSizeUnit,
} from "../../../../lib/presentation/text-layout-css";

/**
 * Whether this browser can actually paint `text` in `typeface`.
 *
 * A symbol font's private-use code point renders as a notdef box where the font
 * is missing, so the marker falls back to a mapped Unicode stand-in. Memoized
 * per (typeface, text): `document.fonts.check` is cheap but this runs once per
 * rendered row. Absent the API (SSR, jsdom) the answer is YES, which is what
 * real PowerPoint does — draw the glyph in its own face.
 */
const symbolFontAvailability = new Map<string, boolean>();

function faceDrawsText(typeface: string, text: string): boolean | undefined {
  const doc = (globalThis as { document?: Document }).document;
  const context = doc?.createElement("canvas").getContext?.("2d");
  if (!context) return undefined;
  const width = (family: string) => {
    context.font = `32px ${family}`;
    return context.measureText(text).width;
  };
  const face = `"${typeface.replace(/"/g, "")}"`;
  return ["monospace", "serif", "sans-serif"].some(
    (fallback) => Math.abs(width(`${face}, ${fallback}`) - width(fallback)) > 0.01,
  );
}






const SYMBOL_SHAPE_CODES: ReadonlyMap<string, ReadonlySet<number>> = new Map(
  Object.entries(symbolShapeCoverage as Record<string, string[]>).map(([family, codes]) => [
    family.toLowerCase(),
    new Set(codes.map((code) => parseInt(code, 16))),
  ]),
);

/** Whether a served shape face draws `text` (one character) for `typeface`; undefined when the face has none. */













function markerSlotCss(indent: number, smartArt = false): CSSProperties {
  // A SmartArt shape's words with a first-line indent (positive): Windows
  // PowerPoint sets the marker where the first line starts, marL + indent,
  
  
  // at 87.7 pt, its lines at 51.7, the words after the bullet's advance). A
  // text box keeps the marker at marL (below; sa36-bullet-posindent).
  if (smartArt && indent > 0) {
    return {
      marginInlineStart: indent / AUTOFIT_EMU_PER_PX,
      width: 0,
      minWidth: "max-content",
    } as CSSProperties;
  }
  return {
    marginInlineStart: Math.min(0, indent) / AUTOFIT_EMU_PER_PX,
    width: Math.abs(indent) / AUTOFIT_EMU_PER_PX,
    minWidth: "max-content",
  } as CSSProperties;
}








function embeddedPanoseSerifStyle(aliasStack: string): number | undefined {
  const family = aliasStack.split(",")[0]?.trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
  if (!family) return undefined;
  for (const face of declaredFaces(family)) {
    if (!face.url || face.style !== "normal" || face.weightMin > 400 || face.weightMax < 400) continue;
    const metrics = faceMetrics(face.url);
    return typeof metrics === "object" && metrics.os2 ? metrics.os2.panose[1] : undefined;
  }
  return undefined;
}

/** What the families {@link presentationBulletDrawnFamily} names start with: not an Office family. */
export const PRESENTATION_BULLET_DRAWN_PREFIX = "MRAI Bullet ";

/**
 * The family drawing `char`, a bullet fallen back to `face` (Cambria Math,
 * Segoe UI Symbol), in `drawnBy`'s bullet face (its glyph set at Windows' ink
 * box and advance), declared on first use (`ensureOfficeScaledScriptFamily`:
 * that face's file for the character's range alone, at its own size) unless
 * the reader has `face` itself.
 */
function presentationBulletDrawnFamily(face: string, char: string, drawnBy: { readonly family: string }): string {
  const code = char.codePointAt(0) as number;
  const hex = code.toString(16).toUpperCase().padStart(4, "0");
  const family = `${PRESENTATION_BULLET_DRAWN_PREFIX}${face} ${hex}`;
  ensureOfficeScaledScriptFamily(family, drawnBy.family, code, `U+${hex}`, "100%", undefined, face);
  return family;
}

export function symbolShapeFaceDraws(typeface: string, text: string): boolean | undefined {
  const codes = SYMBOL_SHAPE_CODES.get(typeface.trim().toLowerCase());
  if (!codes) return undefined;
  const code = text.length === 1 ? text.charCodeAt(0) : -1;
  return code >= 0 && codes.has(code >= 0xf000 ? code : code + 0xf000);
}

export function symbolFontIsAvailable(typeface: string, text: string): boolean {
  const key = `${typeface}:${text}`;
  const cached = symbolFontAvailability.get(key);
  if (cached !== undefined) return cached;
  // Wingdings 2 / 3's circles, squares, rhombuses and triangles are drawn by
  // the served shape faces at Office's own box and advance (Office's themes
  // set list bullets in them: a 2007 theme's U+F097 filled circle, Facet's
  // U+F07D triangle), whatever the browser measures before the face arrives;
  // their other characters keep the stand-ins below.
  if (symbolShapeFaceDraws(typeface, text) === true) {
    try {
      ensureOfficeFontFaces(typeface);
    } catch {
      /* the declaration is the shape face's; the glyph still names its face */
    }
    symbolFontAvailability.set(key, true);
    return true;
  }
  let available = true;
  // A symbol face with a metric-exact open stand-in the page serves (Wine
  // Wingdings for Wingdings, `metric: "exact"`) draws its glyph wherever it
  // runs, once its faces are declared: the marker keeps its own character in
  // its own face. Measured before the stand-in arrives it read as absent and
  // the row drew the bare letter -- Wingdings "p" (a bold white square) as
  
  if (officeFontMetricMatchesWidths(officeFontSubstitution(typeface)?.metric)) {
    try {
      ensureOfficeFontFaces(typeface);
    } catch {
      /* the declaration is the stand-in's; the glyph still names its face */
    }
    symbolFontAvailability.set(key, true);
    return true;
  }
  try {
    // `document.fonts.check` answers true for any face that needs no loading,
    // installed or not, so Safari on a Mac without Wingdings 3 painted a
    // Facet bullet as a notdef box. Whether the face draws THIS character is
    // measured: against each generic fallback, a face that has the glyph
    // changes the advance; one that does not leaves the fallback's own.
    const drawn = faceDrawsText(typeface, text);
    if (drawn !== undefined) available = drawn;
    else {
      const fonts = (globalThis as { document?: { fonts?: FontFaceSet } }).document
        ?.fonts;
      if (fonts && typeof fonts.check === "function") {
        available = fonts.check(`16px "${typeface.replace(/"/g, "")}"`, text);
      }
    }
  } catch {
    available = true;
  }
  symbolFontAvailability.set(key, available);
  return available;
}

export interface PresentationParagraphRowsInput {
  paragraphs: readonly SlideParagraphWithRuns[];
  baselineOffset?: number;
  nativeMetrics?: readonly NativeParagraphMetrics[];
  listIndents?: readonly NativeListIndent[];
  nativeBullet?: readonly (NativeBulletMarker | null)[];
  bulletChar?: string;
  numberFormat?: string;
  fontSizeUnit: PresentationFontSizeUnit;
  paragraphStyle?: CSSProperties;
  autofitLineSpacingMultiplier: number;
  colorOverride?: string;
  suppressFirstSpaceBefore: boolean;
  fontAliases: PresentationFontAliases;
  autofitScale: number;
}

/** One row as both drawings of a body read it. */
export interface PresentationParagraphRowPlan {
  readonly index: number;
  readonly level: number;
  /** The row's runs (null: its plain text in the row's own style). */
  readonly runs: readonly TextRun[] | null;
  readonly text: string;
  /** The marker's characters, when the row draws one (a picture marker draws its `picture`). */
  readonly markerText?: string;
  /** The marker's own symbol-font character (`a:buFont` + `a:buChar`), which `markerText` may stand in for. */
  readonly markerSymbol?: { readonly family: string; readonly char: string };
  /**
   * The bullet drawn in the face PowerPoint for Windows falls back to (`powerPointBulletFace`): its advance there
   * (em of the marker's size), where recorded, and the bullet's own embedded face to try first (`ownStack`).
   */
  readonly markerFallback?: { readonly advanceEm?: number; readonly ownStack?: string };
  readonly markerPicture?: string;
  /** The marker's own style (face, size, colour; its line box left out). */
  readonly markerCss: CSSProperties;
  /** The marker span's box: its offset and width in the row. */
  readonly markerBoxCss: CSSProperties;
  /** The row's resolved text style: line height, spacing, face, size, alignment. */
  readonly rowTextStyle: CSSProperties;
  /** The row's default gutter (the marker gap, the level's em indent), under its text style. */
  readonly gutterCss: CSSProperties;
  /** The row's own indentation over its text style (`padding-inline-start/end`, `text-indent`). */
  readonly indentCss: CSSProperties;
  readonly markerFollowsText: boolean;
  readonly rowJustify?: CSSProperties["justifyContent"];
  readonly dir?: "rtl";
  /** Text alignment (`a:pPr@fontAlgn`): the row's own, else what its level inherits. */
  readonly fontAlign?: "auto" | "t" | "ctr" | "base" | "b";
  /** The Latin face its paragraph mark is set in, where the file says it (`SlideParagraph.endLatinFace`). */
  readonly endLatinFace?: string;
  /** The row's own kerning threshold, points (`SlideParagraph.nativeKerning`, readings row 1009). */
  readonly nativeKerning?: number;
  /** The row's own East Asian line rules (`SlideParagraph.nativeEastAsianLines`, readings row 1009). */
  readonly nativeEastAsianLines?: ParagraphEastAsianLines;
  /** The row ends at a line break of its paragraph, not its mark (`SlideParagraph.endsInLineBreak`). */
  readonly endsInLineBreak?: true;
}

/** Plan every row of a body. */
export function planPresentationParagraphRows({
  paragraphs,
  baselineOffset,
  nativeMetrics,
  listIndents,
  nativeBullet,
  bulletChar,
  numberFormat,
  fontSizeUnit,
  paragraphStyle,
  autofitLineSpacingMultiplier,
  colorOverride,
  suppressFirstSpaceBefore,
  fontAliases,
  autofitScale,
}: PresentationParagraphRowsInput): PresentationParagraphRowPlan[] {
  const rendered = renderParagraphs(paragraphs, {
    bulletChar: normalizeBlockBulletChar(bulletChar),
    numberFormat: normalizeNumberFormat(numberFormat),
    // The scheme and restart the PACKAGE wrote. The receipt has carried them
    // since §31; until now the canvas numbered every row with the bounded
    // gallery's per-level cycle, so a row the package numbered `(III)` was
    // drawn `3.` (§35.9).
    nativeBullet,
  });
  return rendered.map((paragraph, index) => {
    // DrawingML buSzTx makes the marker follow the paragraph text size. The
    // imported block often has no block-level font at all (its 15/16pt lives
    // only on runs), so inheriting from the wrapper painted a small number
    // until the first edit happened to promote that run style. Resolve the
    // marker from the first visible run immediately and keep editing a pure
    // text mutation.
    const paragraphRuns = normalizeRuns(paragraphs[index]?.runs);
    const firstRun = paragraphRuns?.find((run) => run.text.length > 0);
    const runCss = runStyleCss(firstRun?.style, fontSizeUnit, fontAliases, autofitScale);
    // The row takes the first run's size only when every run in it is
    // that size: with one word larger than the rest, the row's promoted
    // size became the inherited size of every run that stated none
    // (PPT-B249).
    const runsShareFirstSize =
      !paragraphRuns ||
      paragraphRuns.every(
        (run) => run.text.length === 0 || run.style?.fontSize === firstRun?.style?.fontSize,
      );
    // The marker wears the first run's OWN colour: a row that opens with
    // a hyperlink draws its bullet in the text colour, not the theme's
    
    const markerColor = firstRun?.style?.href
      ? runStyleCss({ ...firstRun.style, href: undefined }, fontSizeUnit, fontAliases, autofitScale).color
      : runCss.color;
    const markerCss: CSSProperties = {
      fontSize: runCss.fontSize,
      fontFamily: runCss.fontFamily,
      color: colorOverride ?? markerColor,
      fontWeight: runCss.fontWeight,
      fontStyle: runCss.fontStyle,
      // The marker sits on the text's baseline but adds nothing to the
      // line's height: PowerPoint pitches a bulleted row by its text
      // alone (measured in its PDF: 18 pt rows under a 300 % or a 48 pt
      // bullet keep the pitch of rows with none). A marker larger than
      
      
      // spacing, each row ~13 px lower than PowerPoint's). With no line
      // box its glyph still rises (A - D) / 2 above the baseline, which a
      // 300 % bullet's does past its text's; the negative top margin
      // keeps that out of the row too.
      lineHeight: 0,
      marginBlockStart: "-1em",
    };
    // The marker the PACKAGE draws, where the gallery cannot name it. Real
    // PowerPoint paints the glyph in `a:buFont@typeface` and leaves the
    // paragraph text in its own face (ECMA-376 §21.1.2.4.4, confirmed
    // against its own PDF export: U+F06C came out as Wingdings-Regular
    // 0x6C while the text stayed Calibri), so the font goes on the MARKER
    // span alone. `a:buClr` and `a:buSzPct`/`a:buSzPts` are the marker's
    // own colour and size on the same terms -- the explicit Font Color
    // emphasis still wins, as it does over every other paint here.
    // The row's own Bullets and Numbering formatting wins over the
    // package's positional receipt (PPT-A039/A040).
    const nativeMarker: NativeBulletMarker | null | undefined =
      paragraphs[index]?.bulletFormat ??
      (nativeBullet?.length === paragraphs.length
        ? nativeBullet[index]
        : undefined);
    const nativeGlyph = nativeMarker
      ? nativeBulletGlyph(nativeMarker, symbolFontIsAvailable)
      : undefined;
    if (nativeGlyph?.fontFamily !== undefined) {
      // Quoted: unquoted, "Wingdings 3" is not a family name in CSS (a
      // word may not start with a digit), the declaration is dropped and
      // the glyph drew in the text's face as a notdef box.
      markerCss.fontFamily = `"${nativeGlyph.fontFamily.replace(/["\\]/g, "")}"`;
    }
    // A geometric-shape or arrow marker its face has no glyph for is drawn
    // from Times New Roman, as PowerPoint draws it (`MRAI Office Bullet`,
    // globals.css), not from the browser's own last resort.
    if (markerCss.fontFamily !== undefined) {
      markerCss.fontFamily = `${markerCss.fontFamily}, "MRAI Office Bullet"`;
    }
    // A bullet character its face lacks, or of a face Windows lacks, is drawn
    // in the face PowerPoint for Windows draws it in, and laid out at that
    // face's advance (`powerPointBulletFace`: Times New Roman behind a serif
    // face, Arial behind a sans one, then Cambria Math, then Segoe UI Symbol;
    
    // embedded Bree Serif, which has none, is Times New Roman's 7.25 pt dot in
    // PowerPoint's PDF; the stack after the face drew it in the script
    // fallback's symbols face, twice that, ahead of "MRAI Office Bullet".
    let markerFallback: PresentationParagraphRowPlan["markerFallback"];
    const bulletChar = nativeMarker?.char !== undefined && !nativeMarker.picture && nativeGlyph ? nativeGlyph.text : undefined;
    const bulletTypeface = nativeMarker?.typeface ?? firstRun?.style?.fontFamily;
    if (bulletChar !== undefined && typeof bulletTypeface === "string" && bulletTypeface.trim()) {
      const ownName = bulletTypeface.trim().replace(/^["']|["']$/g, "").trim();
      const alias = Object.hasOwn(fontAliases, ownName.toLowerCase()) ? fontAliases[ownName.toLowerCase()] : undefined;
      const panoseSerifStyle = alias !== undefined ? embeddedPanoseSerifStyle(alias) : undefined;
      const fallback = powerPointBulletFace(ownName, bulletChar, alias !== undefined
        ? { embedded: true, ...(panoseSerifStyle !== undefined ? { panoseSerifStyle } : {}) }
        : {});
      const faceStack = fallback ? presentationFontFamilyWithAssets(fallback.face, fontAliases) : undefined;
      // Where the reader lacks the fallback face, its stand-in at Windows'
      // ink box (TRIAGE 99): a family of its own, declared only once the page
      // draws this character and only on a machine without the face, named
      // ahead of the face -- rendering only, never in the page's data.
      const drawn = fallback?.drawnBy ? presentationBulletDrawnFamily(fallback.face, bulletChar, fallback.drawnBy) : undefined;
      const fallbackStack = faceStack && drawn ? `"${drawn}", ${faceStack}` : faceStack;
      if (fallback && fallbackStack) {
        const ownStack = fallback.ownFirst && alias ? (alias.startsWith('"') ? alias : `"${alias}"`) : undefined;
        markerCss.fontFamily = ownStack ? `${ownStack}, ${fallbackStack}` : fallbackStack;
        markerFallback = {
          ...(fallback.advanceEm !== undefined ? { advanceEm: fallback.advanceEm } : {}),
          ...(ownStack ? { ownStack } : {}),
        };
      }
    }
    if (nativeMarker?.color !== undefined && colorOverride === undefined) {
      markerCss.color = nativeMarker.color;
    }
    if (nativeMarker?.sizePct !== undefined) {
      // Relative to the TEXT's size, so under autofit it follows the run's
      // scaled size on its own: PowerPoint drew a 150% marker over 24pt
      // text at `fontScale="50000"` as 18pt -- 150% of the scaled 12, not
      // of the nominal 24 (§40.3).
      markerCss.fontSize = `${nativeMarker.sizePct / 100_000}em`;
    } else if (nativeMarker?.sizePts !== undefined) {
      // An ABSOLUTE marker size, and the same probe showed autofit does NOT
      // touch it: `buSzPts="3600"` came out at 36.0pt while the run beside
      // it went 24 -> 12. So no scale here, deliberately.
      markerCss.fontSize = `${(nativeMarker.sizePts / 100) * CSS_PX_PER_POINT}px`;
    }
    // PowerPoint draws no bullet or number for an EMPTY paragraph (the
    // marker shows only once the row has text, PPT-D006): the audit
    // probe's body "第一级" + an empty row drew one bullet, not two.
    const markerText =
      paragraph.marker === undefined ||
      paragraph.marker === null ||
      !paragraph.text
        ? undefined
        : nativeGlyph?.text ?? paragraph.marker;
    const rowTextStyle = paragraphRowTextStyle(
      paragraphs[index],
      paragraphStyle,
      fontSizeUnit,
      autofitLineSpacingMultiplier,
    );
    // A paragraph's line box must inherit the same explicit typeface and
    // size as its first visible DrawingML run. Otherwise the child glyphs
    // paint at (for example) 24pt while the row still lays out at a 28pt
    // theme default, producing the extra vertical drift seen after import.
    // Do not promote colour/weight/decoration: those remain run-local.
    if (runCss.fontSize !== undefined && runsShareFirstSize) {
      rowTextStyle.fontSize = runCss.fontSize;
    } else if (paragraphRuns && !runsShareFirstSize) {
      // Runs of several sizes, every one stated: the row's own size is
      // only the strut every line stands on, so it takes the smallest.
      // At the box's default a 60 pt word's title with two 20 pt lines
      // under it stood each of those lines on the placeholder's 31.5 pt
      
      // the centred title rose). PowerPoint pitches a line by the runs on
      // it alone. A run that states no size keeps the row's (PPT-B249).
      const sizes = paragraphRuns
        .filter((run) => run.text.length > 0)
        .map((run) => run.style?.fontSize);
      if (sizes.length && sizes.every((size) => typeof size === "number" && size > 0)) {
        const smallest = runStyleCss(
          { fontSize: Math.min(...(sizes as number[])) },
          fontSizeUnit,
          fontAliases,
          autofitScale,
        ).fontSize;
        if (smallest !== undefined) rowTextStyle.fontSize = smallest;
      }
    }
    if (runCss.fontFamily !== undefined) {
      rowTextStyle.fontFamily = runCss.fontFamily;
    }
    // Below single spacing the lead is the row's face's (its descent),
    // and the face is its first run's: placed again on the final face.
    if (typeof rowTextStyle.lineHeight === "number") {
      delete rowTextStyle.top;
      Object.assign(rowTextStyle, officePercentLeadingCss(rowTextStyle.lineHeight, rowTextStyle.fontFamily));
    }
    // A row whose glyph origin was measured against PowerPoint's own
    // (`baselineOffset`, a SmartArt label at 90 %) is placed by that
    // alone: the percentage-spacing lead would move it a second time.
    if (baselineOffset !== undefined) delete rowTextStyle.top;
    // A blank row is as tall as its end mark (`a:endParaRPr@sz`), as
    // PowerPoint lays it out: it took the box's size instead, 18 pt on a
    // shape's label, so every blank line pushed the rows below it down
    
    
    const endFontSize = paragraphEndLineFontSize(paragraphs[index]);
    if (!firstRun && typeof endFontSize === "number" && endFontSize > 0) {
      const endCss = runStyleCss({ fontSize: endFontSize }, fontSizeUnit, fontAliases, autofitScale);
      if (endCss.fontSize !== undefined) rowTextStyle.fontSize = endCss.fontSize;
    }
    if (colorOverride !== undefined) rowTextStyle.color = colorOverride;
    if (index === 0 && suppressFirstSpaceBefore) {
      delete rowTextStyle.paddingTop;
    }
    // PowerPoint leaves no percentage-spacing extra under the last line
    // (`officePercentLeadingCss`): the box's flow ends there.
    if (index === paragraphs.length - 1) {
      const tail = officePercentLeadingTailCss(rowTextStyle.lineHeight, rowTextStyle.fontFamily);
      // Set after any `margin` the row's style carries (a shape label's
      // `margin: 0`): assigned in the place of an earlier `marginBottom`
      // key, the shorthand after it undid it and a label drawn as rows
      
      if (tail.marginBottom !== undefined) delete rowTextStyle.marginBottom;
      Object.assign(rowTextStyle, tail);
    }
    // A centred or right-aligned list item moves its marker with its text:
    // the two align as one unit, as PowerPoint draws them. The marker sat
    // at the left margin while the words moved away (PPT-B133).
    const rowAlign = rowTextStyle.textAlign;
    const rtlRow = paragraphs[index]?.dir === "rtl";
    const markerFollowsText =
      Boolean(markerText) &&
      (rowAlign === "center" || rowAlign === "right" || rowAlign === "end");
    const rowJustify: CSSProperties["justifyContent"] = !markerFollowsText
      ? undefined
      : rowAlign === "center"
        ? "center"
        : rowAlign === "end" || !rtlRow
          ? "flex-end"
          : "flex-start";
    const native = nativeMetrics?.length === paragraphs.length ? nativeMetrics[index] : undefined;
    const nativeSpacing = (value: NativeParagraphMetrics["before"]) => !value ? undefined : value.unit === "percent"
      ? `${value.value / 100000 * IMPORTED_PPTX_NORMAL_LINE_HEIGHT}em` : `${(value.value / 100) * CSS_PX_PER_POINT}px`;
    const nativeStyle: CSSProperties = native ? {
      position: "relative", gap: 0,
      paddingInlineStart: native.marginLeft / AUTOFIT_EMU_PER_PX,
      paddingInlineEnd: native.marginRight / AUTOFIT_EMU_PER_PX,
      textIndent: markerText ? undefined : native.indent / AUTOFIT_EMU_PER_PX,
      paddingTop: index === 0 ? 0 : nativeSpacing(native.before),
      paddingBottom: index === paragraphs.length - 1 ? 0 : nativeSpacing(native.after),
    } : {};
    const ownRow = paragraphs[index];
    const levelIndent =
      listIndents?.[Math.max(0, Math.min(listIndents.length - 1, paragraph.level))];
    // A marked row hangs its marker at marL + indent with its words at
    // marL. The row's OWN values (Paragraph > Before text / Special) win
    // over its level's inherited ones, each on its own (PPT-A041).
    const ownMarL = ownRow?.marL ?? levelIndent?.marL;
    const ladder =
      markerText && !native && ownMarL !== undefined
        ? { marL: ownMarL, indent: ownRow?.indent ?? levelIndent?.indent ?? 0 }
        : undefined;
    const ladderStyle: CSSProperties = ladder
      ? { paddingInlineStart: ladder.marL / AUTOFIT_EMU_PER_PX, gap: 0 }
      : {};
    const gutterCss: CSSProperties = {
      gap: markerText ? "0.4em" : 0,
      paddingInlineStart: `${paragraph.level * PARAGRAPH_INDENT_EM}em`,
    };
    const indentCss: CSSProperties = {
      ...paragraphOwnIndentCss(paragraphs[index], markerText !== undefined),
      ...nativeStyle,
      ...ladderStyle,
    };
    const markerBoxCss: CSSProperties = {
      ...(native ? markerSlotCss(native.indent, true) : {}),
      ...(ladder ? markerSlotCss(ladder.indent) : {}),
    };
    return {
      index,
      level: paragraph.level,
      runs: paragraphRuns ?? null,
      text: paragraph.text,
      ...(markerText !== undefined ? { markerText } : {}),
      ...(markerText !== undefined && nativeMarker?.char !== undefined && nativeMarker.typeface !== undefined && !nativeMarker.picture
        ? { markerSymbol: { family: nativeMarker.typeface, char: nativeMarker.char } }
        : {}),
      ...(nativeMarker?.picture ? { markerPicture: nativeMarker.picture } : {}),
      ...(markerText !== undefined && markerFallback ? { markerFallback } : {}),
      markerCss,
      markerBoxCss,
      rowTextStyle,
      gutterCss,
      indentCss,
      markerFollowsText,
      ...(rowJustify ? { rowJustify } : {}),
      ...(paragraphs[index]?.dir ? { dir: paragraphs[index]!.dir } : {}),
      ...((paragraphs[index]?.fontAlign ?? paragraphs[index]?.fontAlignInherited)
        ? { fontAlign: paragraphs[index]!.fontAlign ?? paragraphs[index]!.fontAlignInherited }
        : {}),
      ...(paragraphs[index]?.endLatinFace ? { endLatinFace: paragraphs[index]!.endLatinFace } : {}),
      ...(normalizeParagraphNativeKerning(paragraphs[index]?.nativeKerning) !== undefined
        ? { nativeKerning: normalizeParagraphNativeKerning(paragraphs[index]!.nativeKerning)! }
        : {}),
      ...(normalizeParagraphEastAsianLines(paragraphs[index]?.nativeEastAsianLines)
        ? { nativeEastAsianLines: normalizeParagraphEastAsianLines(paragraphs[index]!.nativeEastAsianLines)! }
        : {}),
      ...(paragraphs[index]?.endsInLineBreak ? { endsInLineBreak: true as const } : {}),
    };
  });
}
