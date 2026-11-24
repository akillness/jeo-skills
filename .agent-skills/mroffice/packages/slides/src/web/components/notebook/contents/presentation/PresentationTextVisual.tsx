"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The non-editing drawing of a text body on the canvas: baseline measurement
 * request, text layout (insets, autofit, columns, anchoring), and the visual
 * contents with their anchor-centre bounds.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { OfficeTextWarpMarker } from "@mrnote/core/web/components/office-text-warp/OfficeTextWarpMarker.tsx";
import type { TextWarpShadow } from "@mrnote/core/web/lib/office-text-warp-render.ts";
import { OfficeTextShadowCopyMarker } from "@mrnote/core/web/components/office-text-warp/OfficeTextShadowCopyMarker.tsx";
import {
  nativeBaselineRequest,
  measureNativeBaselineOffset,
  type NativeBaselineRequest,
} from "../../../../lib/presentation-native-baseline";
import {
  nativeSmartArtFontProjection,
  ensurePackagedSmartArtFont,
  subscribePackagedSmartArtFont,
  packagedSmartArtFontStatus,
} from "../../../../lib/presentation-smartart-font-policy";
import { readNativeListIndents, readNativeParagraphMetrics } from "@mrnote/core/web/lib/native-drawing-geometry.ts";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePowerPointLineFit } from "./usePowerPointLineFit";
import {
  layoutPresentationTabs,
  normalizePresentationTabStops,
  PresentationMeasuredTabsContext,
} from "../../../../lib/presentation-tab-stops";
import {
  EMPTY_PRESENTATION_FONT_ALIASES,
  presentationFontWitnessFamily,
  type PresentationFontAliases,
} from "@mrnote/core/web/lib/presentation-font-faces.ts";
import { normalizeNativeBulletReceipt, paragraphStatesIndent } from "@mrnote/core/web/lib/presentation-paragraphs.ts";
import { type TextRun, normalizeRuns, runsFromText } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import { readAnchorCenter } from "@mrnote/core/web/lib/presentation-vertical-anchor.ts";
import { measuredOfficeAnchorCenterShift, officeAnchorCenterLineExtents, officeAnchorCenterShift } from "@mrnote/core/web/lib/office-text-layout.ts";
import { EMU_PER_PT, PX_PER_PT } from "@mrnote/core/web/lib/office-units.ts";
import { normalizeColumnCount, textColumnsCss, textColumnsRowDirection } from "@mrnote/core/web/lib/presentation-text-columns.ts";
import { blockClaimsNativeGroup, geometryNumber, isImportedPptxBlock } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import {
  autofitModeForBlock,
  normalizeParagraphsWithRuns,
  ownsParagraphRichLayout,
  type SlideParagraphWithRuns,
  withFlatRunsSplitAcrossParagraphs,
  presentationTextUsesPoints,
} from "@mrnote/core/web/lib/presentation-text-buttons.ts";
import { resolvePresentationTextStyle } from "../../../../lib/presentation-text-style-resolve";
import { blockIsTitle, type DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import { smartArtLabelSizeIsPx, type OfficeSmartArtTextStyle } from "@mrnote/core/web/lib/office-smartart/model.ts";
import { EAST_ASIAN, smartArtEastAsianLinePitch } from "@mrnote/core/web/lib/office-smartart/ms-engine/text.ts";
import { placeholderInheritedParagraphs } from "../../../../lib/presentation-office-body-ladder";
import type { SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import type {
  PresentationBlock,
  PresentationTextBlock,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { asRecord } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import {
  textBlockWraps,
  textBlockStyleCss,
  importedPptxTextAreaWidthEmu,
  shapeTextPaintCss,
  AUTOFIT_EMU_PER_PX,
  autofitRenderForBlock,
  withAutofitFontSize,
  runStyleCss,
  importedPptxRunLineBoxCss,
  officePercentLeadingFlatRowCss,
  needsStructuredParagraphRender,
  textStyleWithUniformIndent,
  splitParagraphListTextStyle,
  suppressImportedFirstParagraphSpaceBefore,
  IMPORTED_PPTX_NORMAL_LINE_HEIGHT,
  type PresentationFontSizeUnit,
  presentationTextPaintOwnsShadow,
} from "../../../../lib/presentation/text-layout-css";
import { PresentationAutofitScaleContext, PresentationRunsText } from "./PresentationRunsText";
import {
  PresentationParagraphPlayContext,
  paragraphPlayRowProps,
  paragraphBuildRows,
} from "../../../../lib/presentation/block-play";
import { PresentationParagraphList } from "./PresentationParagraphList";
import { PresentationFontAliasesContext } from "./usePresentationFontFaces";
import { planPresentationParagraphRows } from "./presentationParagraphRows";
import {
  PRESENTATION_TEXT_ENGINE_ATTRIBUTE,
  PresentationEngineTextBody,
  presentationEngineLineStarts,
  usePresentationEngineBody,
} from "./PresentationEngineTextBody";
import { PresentationEngineEditLayer } from "./PresentationEngineEditLayer";
import { textEngineOn } from "@mrnote/core/web/lib/text-engine/page-adapter.ts";
import { PresentationLetterPlayContext } from "./PresentationRunsText";
import { presentationTextShapingCss } from "../../../../lib/presentation/presentation-text-shaping";

function presentationTextBaselineRequest(
  block: PresentationTextBlock,
  paragraphs: readonly SlideParagraphWithRuns[] | undefined,
  runs: readonly TextRun[] | undefined,
  style: CSSProperties,
  unit: PresentationFontSizeUnit, fontAliases: PresentationFontAliases = EMPTY_PRESENTATION_FONT_ALIASES,
): NativeBaselineRequest | undefined {
  const rawStyle = asRecord(block.style);
  const source = asRecord(block.source);
  const direction = rawStyle?.writingMode ?? block.writingMode ?? style.writingMode ?? "horizontal-tb";
  const nativeView = asRecord(source?.nativeSmartArtView);
  const insets = asRecord(block.textInsets);
  const centeredSmartArt = nativeView?.schemaVersion === "pptx-smartart-drawing-v1" && nativeView.role === "text" &&
    (rawStyle?.verticalAlign ?? block.verticalAlign) === "middle" &&
    paragraphs?.length === 1 && paragraphs[0].lineSpacing === 0.9 &&
    // The measured face covers basic Latin. CJK/emoji may use a fallback face
    // even when the requested Calibri itself is installed and fingerprinted.
    /^[\x20-\x7e]+$/.test(paragraphs[0].text) &&
    typeof insets?.top === "number" && Number.isFinite(insets.top) && insets.top === insets.bottom;
  if (unit !== "point" || direction !== "horizontal-tb" || (geometryNumber(block, "rotation") ?? 0) !== 0 ||
    (!centeredSmartArt && (block.groupId || blockClaimsNativeGroup(block) || source?.nativeSmartArtView)) ||
    autofitModeForBlock(block) === "shrink" || normalizeColumnCount(block.columnCount) > 1 ||
    // A light family's own regular weight (below 400) measures like regular.
    !([undefined, 400, "400", "normal"].includes(style.fontWeight) ||
      (typeof style.fontWeight === "number" && style.fontWeight < 400)) || style.fontStyle === "italic" ||
    paragraphs?.some(p => p.bullet !== "none" || p.level !== 0 ||
      (!centeredSmartArt && p.lineSpacing !== undefined && p.lineSpacing !== 1) || p.spacingFallbackBlocked?.includes("lineSpacing"))) return undefined;
  const textRuns = paragraphs && needsStructuredParagraphRender(paragraphs)
    ? paragraphs.flatMap(p => normalizeRuns(p.runs) ?? runsFromText(p.text))
    : runs ?? runsFromText(block.text);
  let first: NativeBaselineRequest | undefined;
  for (const run of textRuns) {
    if (!run.text.length) continue;
    if (run.style?.bold || run.style?.italic || run.style?.superscript || run.style?.subscript) return undefined;
    const runCss = runStyleCss(run.style, unit, fontAliases);
    const fontFamily = runCss.fontFamily ?? style.fontFamily;
    const fontSizePx = runCss.fontSize ?? style.fontSize;
    if (typeof fontFamily !== "string" || typeof fontSizePx !== "number" || typeof style.lineHeight !== "number") return undefined;
    if (centeredSmartArt && ((geometryNumber(block, "height") ?? 0) - Number(insets?.top) * 2) / AUTOFIT_EMU_PER_PX < fontSizePx * style.lineHeight) return undefined;
    const next = nativeBaselineRequest({ fontFamily, fontSizePx, lineHeight: style.lineHeight,
      ...(centeredSmartArt ? { profile: "smartart-centered-90" as const } : {}), sourceFontFamily: presentationFontWitnessFamily(fontFamily, fontAliases) });
    if (!next || first && (first.fontFamily !== next.fontFamily || first.fontSizePx !== next.fontSizePx)) return undefined;
    first ??= next;
  }
  return first;
}

/** A converted SmartArt label's first-line indent (`smartArtFirstLineIndent`, EMU) as the rows' CSS. */
function smartArtFirstLineIndentCss(block: unknown): CSSProperties {
  // A length on the slide, as the label's margins are: not scaled with the text.
  const value = (block as { smartArtFirstLineIndent?: unknown }).smartArtFirstLineIndent;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 51_206_400) return {};
  return { textIndent: value / AUTOFIT_EMU_PER_PX };
}

/**
 * The line a SmartArt label the Office scene drew (its sizes in design px,
 * its spacing PowerPoint's 90%) stands its Chinese lines at, as PowerPoint
 * draws them: the line its words were fitted at (`smartArtLinePitch`), else
 * the theme's Chinese face's (`smartArtEastAsianLinePitch`). `undefined` for
 * any other block: its lines keep the 1.2 em of the slide's text. Shared by
 * the label's textarea and its preview, so editing does not move its lines.
 */

export function presentationSmartArtLabelLineHeight(
  block: PresentationBlock,
  theme: DeckTheme | undefined,
): number | undefined {
  const label = block as { smartArtKind?: unknown; smartArtLinePitch?: unknown; style?: unknown; text?: unknown };
  if (
    typeof label.smartArtKind !== "string" ||
    !smartArtLabelSizeIsPx(label.style as OfficeSmartArtTextStyle | undefined) ||
    typeof label.text !== "string" ||
    !EAST_ASIAN.test(label.text)
  ) {
    return undefined;
  }
  const stated = label.smartArtLinePitch;
  return typeof stated === "number" && Number.isFinite(stated) && stated >= 1 && stated <= 2
    ? stated
    : smartArtEastAsianLinePitch(theme?.fontScheme?.minorHans ?? theme?.fontScheme?.minorLatin);
}

export function presentationTextVisualLayout(
  block: PresentationBlock,
  bounds: { width: number; height: number },
  slide: { masterId?: string } | undefined,
  masters: readonly SlideMaster[] | undefined,
  theme: DeckTheme | undefined, fontAliases: PresentationFontAliases = EMPTY_PRESENTATION_FONT_ALIASES,
  options: {
    /** The editor's preview beside a text block's textarea: a size or line
     * height the block does not state comes from the same stylesheet rules
     * the textarea draws with (the placeholder's clamp, the slide's 17px),
     * never from a fallback written inline, so the words stay exactly where
     * the textarea showed them when the preview mounts. */
    hostStyled?: boolean;
    /** Draw at this Shrink text on overflow step (the autofit measurer's candidates). */
    forcedFit?: { fontScale: number; lineSpacingMultiplier: number };
  } = {},
) {
  // This is a detached paint view; the source runs and their font identities
  // remain unchanged in Save/export/history.
  const nativeFont = nativeSmartArtFontProjection(block as PresentationTextBlock, fontAliases,
    typeof document === "undefined" ? undefined : document);
  const textBlock = nativeFont.block;
  const fontSizeUnit: PresentationFontSizeUnit = presentationTextUsesPoints(block)
    ? "point"
    : "design-px";
  const statedParagraphs = normalizeParagraphsWithRuns(textBlock.paragraphs);
  const flatRuns = normalizeRuns(textBlock.runs);
  // Rows that state only their own indentation keep their words' formatting
  // on the block's runs (`reconcilePresentationTextBlock`'s indent-only
  // branch). Drawn as rows, each takes its share of those runs.
  const ownParagraphs =
    statedParagraphs &&
    flatRuns &&
    !ownsParagraphRichLayout(statedParagraphs) &&
    statedParagraphs.some((paragraph) => paragraphStatesIndent(paragraph))
      ? withFlatRunsSplitAcrossParagraphs(statedParagraphs, flatRuns, textBlock.text)
      : statedParagraphs;
  // A placeholder of an Office theme layout draws what its layout gives the
  // rows that state nothing (PPT-H008/H009): the download leaves exactly
  // those to the layout.
  const paragraphs = placeholderInheritedParagraphs(
    textBlock,
    ownParagraphs,
    flatRuns,
    slide,
    theme,
    fontSizeUnit,
  );
  const resolvedStyle = textBlockStyleCss(textStyleWithUniformIndent(textBlock), resolvePresentationTextStyle(slide, block, masters, theme), fontSizeUnit, fontAliases);
  // The box's WordArt states its shadow: Home > Text Shadow adds none of its own
  // (`presentationTextPaintOwnsShadow`).
  if (presentationTextPaintOwnsShadow((block as { textPaint?: unknown }).textPaint)) delete resolvedStyle.textShadow;
  // A default title reads at the size its editor shows it (the title box's
  // 28px), not the body's 17px: with a link added, the rich preview and the
  // show drew the same title smaller (PPT-B239).
  const smartArtEastAsianPitch = presentationSmartArtLabelLineHeight(textBlock, theme);
  const baseStyle: CSSProperties = options.hostStyled
    ? smartArtEastAsianPitch !== undefined
      ? { ...resolvedStyle, lineHeight: smartArtEastAsianPitch }
      : resolvedStyle
    : {
        ...resolvedStyle,
        fontSize: resolvedStyle.fontSize ?? (blockIsTitle(block as { placeholder?: unknown }) ? 28 : 17),
        lineHeight: smartArtEastAsianPitch ?? resolvedStyle.lineHeight ?? IMPORTED_PPTX_NORMAL_LINE_HEIGHT,
      };
  const fit = options.forcedFit ?? autofitRenderForBlock(
    block,
    bounds,
    baseStyle.fontSize as number | undefined,
    (slide as { blocks?: readonly PresentationBlock[] } | undefined)?.blocks,
    { slide, masters, theme, fontAliases },
  );
  // A SmartArt label's WordArt (SmartArt Format, PPT-A010).
  const textStyle = { ...withAutofitFontSize(baseStyle, fit, fontSizeUnit), ...shapeTextPaintCss(block) };
  const paragraphTextStyles = splitParagraphListTextStyle(textStyle);
  const columnsCss = textColumnsCss(
    textBlock.columnCount,
    (textBlock.source as { nativeTextColumns?: unknown } | undefined)?.nativeTextColumns,
    (textBlock as { columnSpacing?: unknown }).columnSpacing,
  );
  const flatRunLineBoxStyle = importedPptxRunLineBoxCss(
    flatRuns,
    fontSizeUnit,
    fontAliases,
    fit.fontScale,
  );
  // `a:bodyPr@spcFirstLastPara` (`spaceFirstLastPara`): an imported box whose
  // body leaves the first row's Spacing Before out draws none at its top, as
  // PowerPoint does; absent keeps the editor's own reading (export-look).
  const edgeSpacingLeftOut =
    (textBlock.style as { spaceFirstLastPara?: unknown } | undefined)?.spaceFirstLastPara === false;
  const suppressFirstSpaceBefore = paragraphs
    ? edgeSpacingLeftOut ||
      suppressImportedFirstParagraphSpaceBefore(
        block,
        bounds,
        paragraphs,
        paragraphTextStyles.paragraphStyle,
        textStyle,
      )
    : false;
  return {
    fontPolicyReady: nativeFont.ready,
    packagedSmartArtFont: nativeFont.packaged,
    fontSizeUnit,
    paragraphs,
    flatRuns,
    textStyle,
    // The same fit the block style carries, for the RUN sizes inside it: the
    // scale has to reach wherever a run's own absolute size becomes CSS, which
    // `textStyle` cannot say (§40.3).
    autofitScale: fit.fontScale,
    // The package's line reduction, for rows that state their own spacing.
    autofitLineSpacingMultiplier: fit.lineSpacingMultiplier,
    paragraphTextStyles,
    columnsCss,
    flatRunLineBoxStyle,
    suppressFirstSpaceBefore,
    nativeBaseline: presentationTextBaselineRequest(textBlock, paragraphs, flatRuns, textStyle, fontSizeUnit, fontAliases),
  };
}

export function PresentationTextVisualContents({
  block,
  layout,
  colorOverride,
  slideIds,
  onNavigateToSlide,
  emptyEditable = false,
}: {
  block: PresentationTextBlock;
  layout: ReturnType<typeof presentationTextVisualLayout>;
  /**
   * A body being typed in: an empty row holds a line break for the caret,
   * never the space a row at rest keeps its height with (a key typed there
   * kept the space: "abc\nx ").
   */
  emptyEditable?: boolean;
  colorOverride?: string;
  slideIds?: ReadonlySet<string>;
  onNavigateToSlide?: (slideId: string) => void;
}) {
  const {
    paragraphs,
    flatRuns,
    fontSizeUnit,
    paragraphTextStyles,
    flatRunLineBoxStyle,
    suppressFirstSpaceBefore,
  } = layout;
  const family = layout.nativeBaseline?.fontFamily;
  const size = layout.nativeBaseline?.fontSizePx;
  const leading = layout.nativeBaseline?.lineHeight;
  const baselineProfile = layout.nativeBaseline?.profile;
  const sourceFontFamily = layout.nativeBaseline?.sourceFontFamily;
  const firstRowRef = useRef<HTMLDivElement>(null);
  // A flat body's one row ends its lines where PowerPoint does, as a
  
  const registerLineFitRow = usePowerPointLineFit();
  const flatRowRef = useCallback(
    (element: HTMLDivElement | null) => {
      firstRowRef.current = element;
      registerLineFitRow(element);
    },
    [registerLineFitRow],
  );
  const [packagedFontReady, setPackagedFontReady] = useState(false);
  useEffect(() => {
    const doc = firstRowRef.current?.ownerDocument;
    if (!layout.packagedSmartArtFont || !doc) return;
    const update = () => setPackagedFontReady(packagedSmartArtFontStatus(doc) === "available");
    const release = subscribePackagedSmartArtFont(doc, update);
    update();
    void ensurePackagedSmartArtFont(doc);
    return release;
  }, [layout.packagedSmartArtFont, block.id]);
  const fontPolicyReady = layout.packagedSmartArtFont ? packagedFontReady : layout.fontPolicyReady;
  // WordArt on the text box (PPT-A059): the shared paint on every row.
  const textPaintCss = shapeTextPaintCss(block);
  const paintedParagraphStyle = textPaintCss
    ? { ...paragraphTextStyles.paragraphStyle, ...textPaintCss }
    : paragraphTextStyles.paragraphStyle;
  // A body PowerPoint does not kern (its kerning receipt says 0, or a size
  // its words never reach) is drawn unkerned by the browser too, while it is
  // typed in, so its lines end where the engine's drawing of it at rest ends
  // them (`usePowerPointLineFit` measures it so).
  // Its letters are never joined in a common ligature (PowerPoint draws none).
  const kernedParagraphStyle: CSSProperties = {
    ...paintedParagraphStyle,
    ...presentationTextShapingCss(
      asRecord(block.source)?.nativeKerning,
      (paragraphs ?? []).flatMap((paragraph) =>
        (paragraph.runs ?? []).map((run) => (typeof run.style?.fontSize === "number" ? run.style.fontSize : undefined)),
      ),
      layout.autofitScale || 1,
    ),
    // A converted diagram's bulleted item whose words state a first-line
    // indent (readings row 849): each paragraph's first line starts after its
    
    ...smartArtFirstLineIndentCss(block),
  };
  const visibleParagraphStyle: CSSProperties = fontPolicyReady ? kernedParagraphStyle
    : { ...kernedParagraphStyle, visibility: "hidden" };
  const [measuredOffset, setMeasuredOffset] = useState<number>();
  useLayoutEffect(() => {
    let active = true;
    const doc = firstRowRef.current?.ownerDocument;
    const update = () => {
      if (!active) return;
      const offset = doc && family && size !== undefined && leading !== undefined
        && (baselineProfile !== "smartart-centered-90" || Math.abs((firstRowRef.current?.offsetHeight ?? 0) - size * leading) <= 1)
        ? measureNativeBaselineOffset(doc, { fontFamily: family, fontSizePx: size, lineHeight: leading,
          ...(baselineProfile ? { profile: baselineProfile } : {}), sourceFontFamily })
        : undefined;
      if (active) setMeasuredOffset(offset);
    };
    update();
    if (doc?.fonts?.status === "loading") void doc.fonts.ready.then(update);
    const Observer = doc?.defaultView?.ResizeObserver;
    const observer = baselineProfile && Observer ? new Observer(update) : undefined;
    if (firstRowRef.current) observer?.observe(firstRowRef.current);
    return () => { active = false; observer?.disconnect(); };
  }, [family, size, leading, baselineProfile, sourceFontFamily, block.text]);
  const baselineOffset = layout.nativeBaseline ? measuredOffset : undefined;
  // Tabs: the renderer draws each tab as a span this sizes after layout, the
  // way PowerPoint lays a tab out -- at the box's custom stops
  // (`style.tabStops`), else every inch from the text area's left edge (the
  
  // leading tabs a quarter inch in, PowerPoint an inch).
  const tabStops = useMemo(
    () => normalizePresentationTabStops((block.style as { tabStops?: unknown } | undefined)?.tabStops),
    [block.style],
  );
  const measuredTabs = block.text.includes("\t");
  useLayoutEffect(() => {
    const host = firstRowRef.current?.parentElement;
    if (!measuredTabs || !host) return;
    const run = () =>
      layoutPresentationTabs(host, tabStops, (block.style as { defaultTabPx?: number } | undefined)?.defaultTabPx);
    run();
    const doc = host.ownerDocument;
    if (doc.fonts?.status === "loading") void doc.fonts.ready.then(run);
  });
  // `a:bodyPr@anchorCtr`: the rows align inside the text's own bounds box,
  // centred across the frame. One wrapper, so the canvas, present mode and
  // the thumbnails (all drawn here) agree.
  const anchorCenter = readAnchorCenter(block.style as { anchorCenter?: unknown } | undefined);
  // Columns ordered right to left (`a:bodyPr@rtlCol`): each row states the
  // box's own direction, as the column container's orders only the columns.
  const columnRowDirection = textColumnsRowDirection(layout.columnsCss, (block as { dir?: unknown }).dir);
  // A box of Right-to-Left paragraphs (`dir` on the block, a box of one
  // direction): its rows' base direction, as the slide show draws it
  // (PresentationBlockView). The canvas drew them left to right: "A1:2017 -
  // <Hebrew>" with its Latin label on the left (look-fit
  // truth-probes/lookfit-rtl-align-probe.pptx, PowerPoint: on the right).
  // The box's own alignment (`style.align`, drawn on its container): a
  
  const blockStyle = block.style as { align?: unknown; textAlign?: unknown } | undefined;
  const bodyAlignStated = (blockStyle?.align ?? blockStyle?.textAlign) !== undefined;
  // A converted SmartArt label whose point's words run right to left
  // (`smartArtTextRtl`, readings row 840) is such a box.
  const rowDirection =
    columnRowDirection ??
    ((block as { dir?: unknown }).dir === "rtl" || (block as { smartArtTextRtl?: unknown }).smartArtTextRtl === true
      ? "rtl"
      : undefined);
  // A By Paragraph build plays row by row, so its body is drawn as rows even
  // when a flat body would do.
  const paragraphPlay = useContext(PresentationParagraphPlayContext);
  const flatRowPlay = paragraphPlayRowProps(paragraphPlay, 0);
  // Space Before / After the box states is each paragraph's, as PowerPoint
  // spaces every paragraph of a body by its default (`a:lstStyle`): a flat
  // body of several paragraphs (each "\n" is a hard return) is drawn as rows
  // so the space lands between them, not only at the box's edges (PPT-B415).
  const blockSpacesParagraphs =
    block.text.includes("\n") &&
    (visibleParagraphStyle?.paddingTop !== undefined ||
      visibleParagraphStyle?.paddingBottom !== undefined);
  const buildParagraphs =
    paragraphs ??
    ((paragraphPlay || blockSpacesParagraphs) && block.text.includes("\n")
      ? paragraphBuildRows(block.text, flatRuns, undefined, block)
      : undefined);
  // The text engine's drawing (`PresentationEngineTextBody`): an imported
  // body at rest, on the surfaces that ask for it, laid out line by line as
  // PowerPoint lays it out. Rows read by the same plan the browser-flowed
  // rows are; anything the engine does not lay out stays the browser's.
  const fontAliases = useContext(PresentationFontAliasesContext);
  const letterPlay = useContext(PresentationLetterPlayContext);
  // Planned on every drawing, as the browser-flowed rows are: the body's
  // layout above is too, and the engine's measurements are cached by text.
  const engineRows = (() => {
    const rows = buildParagraphs ?? (block.text ? paragraphBuildRows(block.text, flatRuns, (block as { endLatinFace?: unknown }).endLatinFace, block) : null);
    if (!rows || !rows.length) return null;
    return planPresentationParagraphRows({
      paragraphs: rows,
      // A preserved diagram's label rows keep their drawing's margins and
      // spacing, as the browser-flowed rows below read them.
      nativeMetrics: readNativeParagraphMetrics(asRecord(asRecord(block.source)?.nativeSmartArtView)?.paragraphMetrics),
      listIndents: readNativeListIndents(asRecord(block.source)?.nativeListIndents),
      nativeBullet: normalizeNativeBulletReceipt((block as { nativeBullet?: unknown }).nativeBullet, rows.length),
      bulletChar: block.bulletChar,
      numberFormat: block.numberFormat,
      fontSizeUnit,
      paragraphStyle: visibleParagraphStyle,
      autofitLineSpacingMultiplier: layout.autofitLineSpacingMultiplier,
      colorOverride,
      suppressFirstSpaceBefore,
      fontAliases,
      autofitScale: layout.autofitScale,
    });
  })();
  const engineWidthEmu = importedPptxTextAreaWidthEmu(block);
  // A body the browser would stand at a PowerPoint baseline it was measured
  // at (`layout.nativeBaseline`: Calibri 20 pt, Arial 39 pt, ...) is the
  // engine's too: the engine stands every line at PowerPoint's baseline
  // itself, and only the browser's drawing needs the measured nudge.
  const engineCandidateWhileTyped =
    emptyEditable &&
    !paragraphPlay &&
    !letterPlay &&
    fontPolicyReady &&
    !textPaintCss &&
    !(block as { textWarp?: unknown }).textWarp &&
    !asRecord(block.source)?.nativeSmartArtView &&
    isImportedPptxBlock(block) &&
    fontSizeUnit === "point" &&
    asRecord(block.source)?.nativeKerning !== undefined &&
    !(typeof layout.columnsCss.columnCount === "number" && layout.columnsCss.columnCount > 1);
  const engineCandidate =
    !emptyEditable &&
    !paragraphPlay &&
    !letterPlay &&
    fontPolicyReady &&
    !textPaintCss &&
    !(block as { textWarp?: unknown }).textWarp &&
    isImportedPptxBlock(block) &&
    fontSizeUnit === "point" &&
    // Read under reading row 345 (its kerning receipt; a preserved diagram's
    // label under row 352): a page imported before keeps the browser's
    // drawing, as it looked when it was stored.
    asRecord(block.source)?.nativeKerning !== undefined &&
    !(typeof layout.columnsCss.columnCount === "number" && layout.columnsCss.columnCount > 1);
  const engine = usePresentationEngineBody({
    enabled: engineCandidate,
    rows: engineRows,
    bodyStyle: layout.textStyle,
    fontSizeUnit,
    fontAliases,
    autofitScale: layout.autofitScale,
    tabStops: (block.style as { tabStops?: unknown } | undefined)?.tabStops,
    defaultTabPx: (block.style as { defaultTabPx?: unknown } | undefined)?.defaultTabPx,
    kerning: asRecord(block.source)?.nativeKerning,
    eastAsianLines: asRecord(block.source)?.nativeEastAsianLines,
    lineBox: asRecord(block.source)?.nativeLineBox,
    // Row 1013: the empty lines a body ends on, in their mark's (or break's) size and face.
    markLines: asRecord(block.source)?.nativeMarkLines,
    ...(buildParagraphs ? {} : { flatText: block.text, flatRuns: block.runs }),
    widthPx: engineWidthEmu === null ? null : engineWidthEmu / AUTOFIT_EMU_PER_PX,
    wrap: textBlockWraps(block),
    naturalLines: Boolean(asRecord(block.source)?.nativeSmartArtView),
  });
  // Being typed in, the body keeps its editing rows; the engine says where
  // their lines end, and the rows are fitted to end them there.
  const editEngine = usePresentationEngineBody({
    enabled: engineCandidateWhileTyped,
    force: true,
    rows: engineRows,
    bodyStyle: layout.textStyle,
    fontSizeUnit,
    fontAliases,
    autofitScale: layout.autofitScale,
    tabStops: (block.style as { tabStops?: unknown } | undefined)?.tabStops,
    defaultTabPx: (block.style as { defaultTabPx?: unknown } | undefined)?.defaultTabPx,
    kerning: asRecord(block.source)?.nativeKerning,
    eastAsianLines: asRecord(block.source)?.nativeEastAsianLines,
    lineBox: asRecord(block.source)?.nativeLineBox,
    widthPx: engineWidthEmu === null ? null : engineWidthEmu / AUTOFIT_EMU_PER_PX,
    wrap: textBlockWraps(block),
    naturalLines: Boolean(asRecord(block.source)?.nativeSmartArtView),
  });
  const engineLineStarts = editEngine.status === "ok" ? presentationEngineLineStarts(editEngine) : undefined;
  // Being typed in, drawn by the engine too (`PresentationEngineEditLayer`):
  // its rows below stay the caret's, unpainted.
  // The layer stays mounted while the body is typed in, its answer or not:
  // the host's rows are never remounted under the caret.
  const editLayered = engineCandidateWhileTyped && engineRows !== null && engineWidthEmu !== null && textEngineOn("slides-edit");
  const editDrawn = editLayered && editEngine.status === "ok" ? editEngine : null;
  if (engine.status === "ok" && engineRows) {
    return (
      <PresentationAutofitScaleContext.Provider value={layout.autofitScale}>
        <PresentationAnchorCenterBounds anchorCenter={anchorCenter} shiftPx={anchorCenter ? engineAnchorCenterShiftPx(engine.layout.paragraphs, engine.input.paragraphs, (engineWidthEmu ?? 0) / EMU_PER_PT) : undefined}>
          <PresentationEngineTextBody
            answer={engine}
            rows={engineRows}
            fontSizeUnit={fontSizeUnit}
            fontAliases={fontAliases}
            autofitScale={layout.autofitScale}
            colorOverride={colorOverride}
          />
        </PresentationAnchorCenterBounds>
      </PresentationAutofitScaleContext.Provider>
    );
  }
  // The package's autofit reaches the RUNS through here (§40.3). One provider
  // for both shapes of this body, because both draw runs.
  return (
    <PresentationMeasuredTabsContext.Provider value={measuredTabs}>
    <PresentationAutofitScaleContext.Provider value={layout.autofitScale}>
      {/* A body the engine will draw once its faces land: the print waits for it. */}
      {engine.status === "pending" ? <span hidden {...{ [PRESENTATION_TEXT_ENGINE_ATTRIBUTE]: "pending" }} /> : null}
      <PresentationAnchorCenterBounds anchorCenter={anchorCenter}>
      <PresentationEngineEditScope
        layered={editLayered}
        answer={editDrawn}
        rows={engineRows}
        bodyStyle={layout.textStyle}
        fontSizeUnit={fontSizeUnit}
        fontAliases={fontAliases}
        autofitScale={layout.autofitScale}
        tabStops={(block.style as { tabStops?: unknown } | undefined)?.tabStops}
        defaultTabPx={(block.style as { defaultTabPx?: unknown } | undefined)?.defaultTabPx}
        kerning={asRecord(block.source)?.nativeKerning}
        eastAsianLines={asRecord(block.source)?.nativeEastAsianLines}
        lineBox={asRecord(block.source)?.nativeLineBox}
        widthPx={engineWidthEmu === null ? null : engineWidthEmu / AUTOFIT_EMU_PER_PX}
        wrap={textBlockWraps(block)}
        colorOverride={colorOverride}
      >
      <PresentationTextPaintScope painted={textPaintCss !== null}>
      {/* WordArt Transform: the box's words drawn bent (shared painter). */}
      <OfficeTextWarpMarker
        warp={(block as { textWarp?: unknown }).textWarp}
        shadow={(block as { textPaint?: { shadow?: TextWarpShadow } }).textPaint?.shadow ?? null}
        noWrap={!textBlockWraps(block)}
      />
      {/* Text Effects > Shadow > Perspective on straight words (shared copy). */}
      <OfficeTextShadowCopyMarker
        warp={(block as { textWarp?: unknown }).textWarp}
        shadow={(block as { textPaint?: { shadow?: TextWarpShadow } }).textPaint?.shadow ?? null}
      />
      {buildParagraphs && (paragraphPlay || blockSpacesParagraphs || needsStructuredParagraphRender(buildParagraphs)) ? (
    <PresentationParagraphList
      emptyRowAsBreak={emptyEditable}
      engineLineStarts={engineLineStarts}
      autofitLineSpacingMultiplier={layout.autofitLineSpacingMultiplier}
      nativeMetrics={readNativeParagraphMetrics(asRecord(asRecord(block.source)?.nativeSmartArtView)?.paragraphMetrics)}
      listIndents={readNativeListIndents(asRecord(block.source)?.nativeListIndents)}
      paragraphs={buildParagraphs}
      nativeBullet={normalizeNativeBulletReceipt(
        (block as { nativeBullet?: unknown }).nativeBullet,
        buildParagraphs.length,
      )}
      baselineOffset={baselineOffset}
      firstRowRef={firstRowRef}
      bulletChar={block.bulletChar}
      numberFormat={block.numberFormat}
      fontSizeUnit={fontSizeUnit}
      paragraphStyle={visibleParagraphStyle}
      bodyAlignStated={bodyAlignStated}
      colorOverride={colorOverride}
      suppressFirstSpaceBefore={suppressFirstSpaceBefore}
      wrap={textBlockWraps(block)}
      rowDirection={rowDirection}
      slideIds={slideIds}
      onNavigateToSlide={onNavigateToSlide}
    />
  ) : (
    <div
      ref={flatRowRef}
      // The ONE row a flat text body draws, and the element that carries the
      // resolved paragraph style -- colour, family, size, line height. Until
      // `6b108cba7b` (canvas and thumbnails onto one canonical renderer) this
      // was a `<p>`, and everything that reads a rendered text block's
      // resolved style read it as `querySelector("p")`. A structured body's
      // rows are `presentation-paragraph`; this is the flat body's, and naming
      // it keeps both shapes of the same canonical body addressable.
      data-testid="presentation-text-row"
      dir={rowDirection}
      className={flatRowPlay.className}
      data-paragraph-play={flatRowPlay.state}
      style={{
        ...visibleParagraphStyle,
        // A Right-to-Left row stating no alignment is Left, a physical side
        // (PowerPoint's print of the probe above), not the direction's start.
        ...(rowDirection === "rtl" && visibleParagraphStyle.textAlign === undefined && !bodyAlignStated ? { textAlign: "left" as const } : {}),
        ...flatRunLineBoxStyle,
        // Its glyphs stand in their lines where PowerPoint's do, as a
        // paragraph row's (`officePercentLeadingFlatRowCss`); a row placed by
        // its measured native baseline is placed by that alone.
        ...(baselineOffset === undefined
          ? officePercentLeadingFlatRowCss(
              visibleParagraphStyle.lineHeight,
              flatRunLineBoxStyle.fontFamily ?? visibleParagraphStyle.fontFamily,
            )
          : {}),
        ...(baselineOffset === undefined ? {} : { transform: `translateY(${baselineOffset}px)` }),
        ...(colorOverride ? { color: colorOverride } : {}),
        ...flatRowPlay.style,
      }}
    >
      {emptyEditable && !block.text ? (
        <br data-presentation-empty-row="true" />
      ) : (
        <PresentationRunsText
          text={block.text}
          runs={flatRuns ?? undefined}
          fontSizeUnit={fontSizeUnit}
          colorOverride={colorOverride}
          slideIds={slideIds}
          onNavigateToSlide={onNavigateToSlide}
        />
      )}
    </div>
      )}
      </PresentationTextPaintScope>
      </PresentationEngineEditScope>
      </PresentationAnchorCenterBounds>
    </PresentationAutofitScaleContext.Provider>
    </PresentationMeasuredTabsContext.Provider>
  );
}

/** A body being typed in, drawn by the engine over its rows when it can be; else the rows alone, as before. */
function PresentationEngineEditScope({
  layered,
  answer,
  rows,
  widthPx,
  children,
  ...rest
}: Parameters<typeof PresentationEngineEditLayer>[0] & {
  /** Drawn by the layer (with or without an answer yet), or the rows alone, as before. */
  layered: boolean;
}) {
  if (!layered) return <>{children}</>;
  return (
    <PresentationEngineEditLayer answer={answer} rows={rows} widthPx={widthPx} {...rest}>
      {children}
    </PresentationEngineEditLayer>
  );
}

/**
 * The words of a WordArt text box: their runs take the box's paint, not a
 * colour of their own (`[data-text-paint]` in the stylesheet). A box without
 * WordArt keeps its exact DOM.
 */
function PresentationTextPaintScope({ painted, children }: { painted: boolean; children: ReactNode }) {
  if (!painted) return <>{children}</>;
  return (
    <div data-text-paint="true" style={{ display: "contents" }}>
      {children}
    </div>
  );
}

/** {@link officeAnchorCenterShift} of an engine layout, in CSS px ({@link officeAnchorCenterLineExtents}). */
function engineAnchorCenterShiftPx(
  paragraphs: Parameters<typeof officeAnchorCenterLineExtents>[0],
  inputs: Parameters<typeof officeAnchorCenterLineExtents>[1],
  widthPt: number,
): number {
  return Math.round(officeAnchorCenterShift(officeAnchorCenterLineExtents(paragraphs, inputs), widthPt) * PX_PER_PT * 1000) / 1000;
}

/**
 * The body under `a:bodyPr@anchorCtr`, moved as PowerPoint moves it
 * ({@link officeAnchorCenterShift}): laid out across the whole text area,
 * then moved so the box around its laid lines is centred in it. `shiftPx`
 * is the engine's own answer (its laid lines); a browser-flowed body is
 * measured after layout. A no-op when the attribute is off.
 */
function PresentationAnchorCenterBounds({
  anchorCenter,
  shiftPx,
  children,
}: {
  anchorCenter: boolean;
  shiftPx?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!anchorCenter || shiftPx !== undefined || !element) return;
    const update = () => {
      const next = Math.round(measuredOfficeAnchorCenterShift(element) * 1000) / 1000;
      setMeasured((current) => (Math.abs(current - next) < 0.01 ? current : next));
    };
    update();
    const doc = element.ownerDocument;
    let active = true;
    if (doc.fonts?.status === "loading") void doc.fonts.ready.then(() => active && update());
    const Observer = doc.defaultView?.ResizeObserver;
    const observer = Observer ? new Observer(update) : undefined;
    observer?.observe(element);
    return () => {
      active = false;
      observer?.disconnect();
    };
  });
  if (!anchorCenter) return <>{children}</>;
  const shift = shiftPx ?? measured;
  return (
    <div
      ref={ref}
      data-testid="presentation-anchor-center-bounds"
      style={shift ? { transform: `translateX(${shift}px)` } : undefined}
    >
      {children}
    </div>
  );
}
