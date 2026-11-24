"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Header & footer on a slide: the resolved header/footer of a slide, the
 * overlay that draws date, footer and slide number placeholders, and the
 * Header & Footer dialog draft.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { pointsToCssPx } from "@mrnote/core/web/lib/presentation/text-units.ts";
import { runStyleCss } from "../../../../lib/presentation/text-layout-css";
import type { RunStyle } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import { useContext, type CSSProperties } from "react";
import { paragraphBuildRows } from "../../../../lib/presentation/block-play";
import { PresentationEngineOrFallback } from "./PresentationEngineTextBody";
import { planPresentationParagraphRows } from "./presentationParagraphRows";
import { PresentationFontAliasesContext } from "./usePresentationFontFaces";
import { normalizeSlideLayoutRef } from "@mrnote/core/web/lib/presentation-layouts.ts";
import type { PresentationHeaderFooterDialogDraft } from "@mrnote/core/web/lib/presentation-slide-buttons.ts";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import { officeLayoutHasFooters } from "../../../../lib/presentation-office-layout-edit";
import {
  isCatalogPreviewBlock,
  resolveSlideMaster,
  resolveSlideNativeLayout,
  type SlideMaster,
} from "@mrnote/core/web/lib/presentation-master.ts";
import { buildBlockTransform } from "@mrnote/core/web/lib/presentation-drag.ts";
import { slideBounds } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import {
  formatDeckDate,
  headerFooterWithoutSlideOwnBand,
  resolveHeaderFooterForSlide,
  slideNumberLabel,
  type DeckHeaderFooter,
  type PresentationDateFieldLocale,
} from "@mrnote/core/web/lib/presentation-header-footer.ts";
import { presentationFooterFieldZIndex } from "@mrnote/core/web/lib/presentation-paint-order.ts";
import { flippedTextTransform } from "@mrnote/core/web/lib/presentation-shape-text-rect.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";

export function presentationHeaderFooterDialogDraft(
  visible: DeckHeaderFooter | undefined,
  deck: DeckHeaderFooter | undefined,
  locale: PresentationDateFieldLocale,
): PresentationHeaderFooterDialogDraft {
  const dateField = visible?.dateField;
  return {
    slideNumber: visible?.slideNumber === true,
    footerEnabled: visible?.footerText !== undefined,
    footerText: visible?.footerText ?? "",
    dateEnabled: dateField !== undefined,
    dateMode: dateField?.mode ?? "auto",
    fixedDateText: dateField?.mode === "fixed" ? dateField.text ?? "" : "",
    dateFormat: dateField?.format ?? "datetime1",
    dateLocale: dateField?.locale ?? locale,
    excludeTitleSlide: deck?.excludeTitleSlide === true,
  };
}

/**
 * Read-only render of one slide for Present mode. Reuses the same geometry
 * helpers and block-level rendering as the editor so the projected slide
 * matches what the author sees while editing.
 */
/**
 * The slide's footer, date and number as the deck's Header & Footer resolve
 * them for this slide: the editor canvas, the show, the presenter view and
 * Reading View all draw it, so what the slide shows while editing is what it
 * shows while presenting (PPT-B083). Nothing is rendered without one.
 */
export function PresentationHeaderFooterOverlay({
  resolved,
  deckIndex,
  now,
  testIdPrefix,
  placement,
}: {
  resolved: DeckHeaderFooter | undefined;
  /** The slide's 0-based place in the deck (numbers follow the deck). */
  deckIndex: number;
  now: Date;
  testIdPrefix: string;
  /** Where the slide's layout puts each field (`presentationHeaderFooterPlacement`). */
  placement?: HeaderFooterPlacement;
}) {
  const fontAliases = useContext(PresentationFontAliasesContext);
  if (!resolved) return null;
  const date = resolved.dateField ? formatDeckDate(resolved.dateField, now) : "";
  const common: CSSProperties = {
    position: "absolute",
    bottom: "2.5%",
    fontSize: 11,
    lineHeight: 1.2,
    color: "rgba(71,85,105,0.85)",
    pointerEvents: "none",
    zIndex: 2,
  };
  const clipped: CSSProperties = {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  };
  // An imported deck: a field goes where the slide's layout (else master)
  // placeholder for it sits, in that placeholder's text style -- where
  // PowerPoint draws the slide's own footer placeholders. A field with no
  // such placeholder (a deck made here) keeps Office's default master place:
  // the date at the left, the footer in the middle, the number at the right.
  const field = (
    kind: HeaderFooterFieldKind,
    text: string,
    testId: string,
    className: string,
    fallback: CSSProperties,
  ) => {
    const box = placement?.[kind];
    if (box) {
      const textStyle = headerFooterFieldTextStyle(box);
      const words = <span style={textStyle}>{text}</span>;
      // The placeholder's words laid by the text engine where the page read
      // its kerning (as a slide's placeholder text is); the browser's span
      // stays while the engine is pending, or for a page read before.
      const rows =
        box.kerning !== undefined && box.textWidthEmu !== undefined && text
          ? planPresentationParagraphRows({
              paragraphs: paragraphBuildRows(text, [{ text, ...(box.runStyle ? { style: box.runStyle } : {}) }], box.endLatinFace),
              fontSizeUnit: "point",
              paragraphStyle: textStyle,
              autofitLineSpacingMultiplier: 1,
              suppressFirstSpaceBefore: false,
              fontAliases,
              autofitScale: 1,
            })
          : null;
      return (
        <div className={className} data-testid={testId} aria-hidden="true" style={headerFooterFieldStyle(box)}>
          {rows && rows.length > 0 ? (
            <PresentationEngineOrFallback
              rows={rows}
              bodyStyle={textStyle}
              fontSizeUnit="point"
              autofitScale={1}
              kerning={box.kerning}
              widthPx={(box.textWidthEmu ?? 0) / EMU_PER_DESIGN_PX}
              wrap
              fallback={words}
            />
          ) : (
            words
          )}
        </div>
      );
    }
    return (
      <div className={className} data-testid={testId} aria-hidden="true" style={fallback}>
        {text}
      </div>
    );
  };
  return (
    <>
      {resolved.footerText
        ? field("ftr", resolved.footerText, `${testIdPrefix}-footer`, "presentation-window__deck-footer", {
            ...common,
            ...clipped,
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: "40%",
            textAlign: "center",
          })
        : null}
      {resolved.slideNumber
        ? field(
            "sldNum",
            slideNumberLabel(deckIndex, resolved.firstSlideNumber ?? 1),
            `${testIdPrefix}-slide-number`,
            "presentation-window__deck-slide-number",
            { ...common, right: "3%" },
          )
        : null}
      {date
        ? field("dt", date, `${testIdPrefix}-date`, "presentation-window__deck-date", {
            ...common,
            ...clipped,
            left: "3%",
            maxWidth: "26%",
          })
        : null}
    </>
  );
}

/** The deck's Header & Footer as they apply to one slide. */
export function presentationSlideHeaderFooter(
  headerFooter: DeckHeaderFooter | undefined,
  slide: SlideModel,
  masters: readonly SlideMaster[] | undefined,
  theme?: DeckTheme | null,
): DeckHeaderFooter | undefined {
  // Master Layout > Footers cleared on the slide's layout (PPT-B030).
  if (!officeLayoutHasFooters(theme, normalizeSlideLayoutRef(slide.layout))) {
    return undefined;
  }
  const isTitle =
    (resolveSlideNativeLayout(slide, masters ?? [])?.builtInLayoutId ??
      slide.layout) === "title";
  // A field the slide holds as its own placeholder is drawn there, once.
  return headerFooterWithoutSlideOwnBand(resolveHeaderFooterForSlide(headerFooter, slide.id, isTitle), slide.blocks);
}

export type HeaderFooterFieldKind = "ftr" | "sldNum" | "dt";

/** One Header & Footer field's box and look, as fractions of the slide. */
export interface HeaderFooterFieldBox {
  /** Where the slide's paint order stands it (`presentationFooterFieldZIndex`). */
  zIndex?: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /**
   * The placeholder's turn (degrees clockwise, about the box's centre) and
   * flips, drawn as a slide block's are (`buildBlockTransform`). Microsoft's
   * "Dark modernist" master sets its footer and slide number up the bar at
   * the slide's right edge (`a:xfrm rot="16200000"`); drawn in the unturned
   * frame they lay across the slide's middle, over the title.
   */
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  /** The box's text insets, as fractions of the slide's WIDTH (CSS padding). */
  insets: { left: number; top: number; right: number; bottom: number };
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  fontSizePt?: number;
  color?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  





  runStyle?: RunStyle;
  







  textWidthEmu?: number;
  kerning?: unknown;
  /** The placeholder's paragraph mark's Latin face (`endLatinFace`, readings row 899). */
  endLatinFace?: string;
}

export type HeaderFooterPlacement = Partial<Record<HeaderFooterFieldKind, HeaderFooterFieldBox>>;

const HEADER_FOOTER_FIELD_KINDS: readonly HeaderFooterFieldKind[] = ["ftr", "sldNum", "dt"];
/** EMU per design-surface pixel (a point is 4/3 of it). */
const EMU_PER_DESIGN_PX = 9525;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bandFieldBox(
  block: Record<string, unknown>,
  slideWidth: number,
  slideHeight: number,
): HeaderFooterFieldBox | undefined {
  const left = finiteNumber(block.left);
  const top = finiteNumber(block.top);
  const width = finiteNumber(block.width);
  const height = finiteNumber(block.height);
  if (left === undefined || top === undefined || !width || !height || width <= 0 || height <= 0) {
    return undefined;
  }
  const style = (block.style && typeof block.style === "object" ? block.style : {}) as Record<string, unknown>;
  const pick = (key: string) => block[key] ?? style[key];
  const alignValue = pick("align");
  const verticalValue = pick("verticalAlign");
  const insets = (block.textInsets && typeof block.textInsets === "object" ? block.textInsets : {}) as Record<
    string,
    unknown
  >;
  const inset = (key: string, fallback: number) => (finiteNumber(insets[key]) ?? fallback) / slideWidth;
  const runs = Array.isArray(block.runs) ? block.runs : [];
  const firstRun = runs.find((run) => run && typeof run === "object") as { style?: Record<string, unknown> } | undefined;
  const runStyle = firstRun?.style && typeof firstRun.style === "object" ? firstRun.style : {};
  const fontSizePt = finiteNumber(runStyle.fontSize);
  const rotation = finiteNumber(block.rotation);
  const textWidthEmu = width - (finiteNumber(insets.left) ?? 91_440) - (finiteNumber(insets.right) ?? 91_440);
  const source = block.source && typeof block.source === "object" ? (block.source as Record<string, unknown>) : {};
  const kerning = source.nativeKerning;
  const paragraphs = Array.isArray(block.paragraphs) ? block.paragraphs : [];
  const lastParagraph = paragraphs[paragraphs.length - 1] as { endLatinFace?: unknown } | undefined;
  const statedFace = block.endLatinFace ?? lastParagraph?.endLatinFace;
  const endLatinFace = typeof statedFace === "string" && statedFace.trim() ? statedFace.trim() : undefined;
  return {
    left: left / slideWidth,
    top: top / slideHeight,
    width: width / slideWidth,
    height: height / slideHeight,
    ...(rotation !== undefined && rotation % 360 !== 0 ? { rotation } : {}),
    ...(block.flipH === true ? { flipH: true } : {}),
    ...(block.flipV === true ? { flipV: true } : {}),
    insets: {
      left: inset("left", 91_440),
      top: inset("top", 45_720),
      right: inset("right", 91_440),
      bottom: inset("bottom", 45_720),
    },
    align: alignValue === "center" || alignValue === "right" ? alignValue : "left",
    verticalAlign: verticalValue === "middle" || verticalValue === "bottom" ? verticalValue : "top",
    ...(fontSizePt !== undefined && fontSizePt > 0 ? { fontSizePt } : {}),
    ...(typeof runStyle.color === "string" ? { color: runStyle.color } : {}),
    ...(typeof runStyle.fontFamily === "string" ? { fontFamily: runStyle.fontFamily } : {}),
    ...(runStyle.bold === true ? { bold: true } : {}),
    ...(runStyle.italic === true ? { italic: true } : {}),
    ...(Object.keys(runStyle).length > 0 ? { runStyle: runStyle as RunStyle } : {}),
    ...(textWidthEmu > 0 ? { textWidthEmu } : {}),
    ...(kerning !== undefined ? { kerning } : {}),
    ...(endLatinFace ? { endLatinFace } : {}),
  };
}








function slideOwnHeaderFooterField(slide: SlideModel, kind: HeaderFooterFieldKind): Record<string, unknown> | undefined {
  const fields = (slide as unknown as { headerFooterFields?: unknown }).headerFooterFields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return undefined;
  const field = (fields as Record<string, unknown>)[kind];
  return field && typeof field === "object" && !Array.isArray(field) ? (field as Record<string, unknown>) : undefined;
}

/**
 * Where an imported slide's Header & Footer fields go: the slide's own field
 * (`slideOwnHeaderFooterField`), else the slide layout's date / footer /
 * slide-number placeholder (else its master's), with that placeholder's text
 * style -- where PowerPoint draws the slide's own footer placeholders, which
 * the deck's Header & Footer reading took off the slide. Undefined for a
 * slide whose layout and master carry no such placeholder (a deck made
 * here): the overlay keeps its default places.
 */
export function presentationHeaderFooterPlacement(
  slide: SlideModel | undefined,
  masters: readonly SlideMaster[] | undefined,
): HeaderFooterPlacement | undefined {
  if (!slide) return undefined;
  const { width, height } = slideBounds(slide as unknown as Record<string, unknown>);
  const placement: HeaderFooterPlacement = {};
  for (const kind of HEADER_FOOTER_FIELD_KINDS) {
    const own = slideOwnHeaderFooterField(slide, kind);
    const box = own ? bandFieldBox(own, width, height) : undefined;
    if (box) placement[kind] = box;
  }
  if (!masters || masters.length === 0) {
    return Object.keys(placement).length > 0 ? stackedInSlide(placement, slide) : undefined;
  }
  const layout = resolveSlideNativeLayout(slide, masters);
  const master = resolveSlideMaster(slide, masters);
  for (const kind of HEADER_FOOTER_FIELD_KINDS) {
    if (placement[kind]) continue;
    for (const blocks of [layout?.blocks, master?.blocks]) {
      const block = (blocks ?? []).find(
        (candidate) => candidate?.placeholderType === kind && isCatalogPreviewBlock(candidate),
      );
      const box = block ? bandFieldBox(block, width, height) : undefined;
      if (box) {
        placement[kind] = box;
        break;
      }
    }
  }
  return Object.keys(placement).length > 0 ? stackedInSlide(placement, slide) : undefined;
}

/** Each field where the slide's paint order puts it (`presentationFooterFieldZIndex`). */
function stackedInSlide(placement: HeaderFooterPlacement, slide: SlideModel): HeaderFooterPlacement {
  const stacked: HeaderFooterPlacement = {};
  for (const kind of HEADER_FOOTER_FIELD_KINDS) {
    const box = placement[kind];
    if (box) stacked[kind] = { ...box, zIndex: presentationFooterFieldZIndex(slide, kind) };
  }
  return stacked;
}

function headerFooterFieldStyle(box: HeaderFooterFieldBox): CSSProperties {
  const percent = (value: number) => `${value * 100}%`;
  // Turned and flipped about the box's centre, as the canvas draws a block.
  const transform = buildBlockTransform(box.rotation, box);
  return {
    position: "absolute",
    left: percent(box.left),
    top: percent(box.top),
    width: percent(box.width),
    height: percent(box.height),
    boxSizing: "border-box",
    padding: `${percent(box.insets.top)} ${percent(box.insets.right)} ${percent(box.insets.bottom)} ${percent(box.insets.left)}`,
    display: "flex",
    flexDirection: "column",
    justifyContent:
      box.verticalAlign === "middle" ? "center" : box.verticalAlign === "bottom" ? "flex-end" : "flex-start",
    textAlign: box.align,
    pointerEvents: "none",
    zIndex: box.zIndex ?? 2,
    ...(transform ? { transform, transformOrigin: "center center" } : {}),
  };
}

function headerFooterFieldTextStyle(box: HeaderFooterFieldBox): CSSProperties {
  // The words of a flipped box are never mirrored (`flippedTextTransform`).
  const unmirrored = flippedTextTransform(box);
  return {
    display: "block",
    ...(unmirrored ? { transform: unmirrored } : {}),
    whiteSpace: "pre-wrap",
    lineHeight: 1.2,
    // A point is 4/3 of the design surface's pixel (9525 EMU per pixel).
    fontSize: box.fontSizePt !== undefined ? pointsToCssPx(box.fontSizePt) : 11,
    color: box.color ?? "rgba(71,85,105,0.85)",
    ...(box.fontFamily ? { fontFamily: box.fontFamily } : {}),
    ...(box.bold ? { fontWeight: 700 } : {}),
    ...(box.italic ? { fontStyle: "italic" } : {}),
    // The placeholder's run, as the slide draws a run (its size in points).
    ...(box.runStyle ? runStyleCss(box.runStyle, "point") : {}),
  };
}
