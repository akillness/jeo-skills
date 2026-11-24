"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Draws one slide block (text, shape, picture, table, chart, SmartArt, media,
 * zoom tile, ink) at its geometry with its animation play state; shared by the
 * editor canvas, thumbnails and the slideshow.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { PresentationEngineTableCellText, usePresentationEngineTable } from "./presentationEngineTable";
import { usePresentationMergedRowHeights } from "./usePresentationMergedRowHeights";
import { PRESENTATION_TEXT_ENGINE_ATTRIBUTE } from "./PresentationEngineTextBody";
import { useAutofitMeasureVersion } from "../../../../lib/presentation/autofit-measure-store";
import {
  presentationTableCellParagraphBreakStyles,
  presentationTableCellParagraphStyles,
  presentationTableCellRunParagraphs,
  presentationTableCellTrailingParagraphStyle,
} from "../../../../lib/presentation/table-cell-paragraphs";
import { Fragment, memo, useContext, useId, useMemo, useRef, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { PresentationFontAliasesContext } from "./usePresentationFontFaces";
import { cellCharacterRuns, cellRunSymbolFontFamily, cellRunSymbolPieces, presentationCellTextRunCss } from "@mrnote/core/web/lib/presentation-cell-rich-text.ts";
import { PresentationMathRun } from "@mrnote/core/web/components/notebook/contents/presentation/PresentationMathRun.tsx";
import { cellDisplayText } from "@mrnote/core/web/lib/presentation-cell-soft-break.ts";
import { presentationThemeGridColors } from "@mrnote/core/web/lib/presentation-theme-color-binding.ts";
import { normalizeLinkTooltip } from "@mrnote/core/web/lib/presentation-link-settings.ts";
import { type RunStyle, normalizeRunHyperlink } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import { readSpacingFromStyle } from "@mrnote/core/web/lib/presentation-line-spacing.ts";
import { normalizeShapeKind, presentationShapeBlendCss } from "@mrnote/core/web/lib/presentation-shapes.ts";
import { readVerticalAnchor, verticalAnchorWrapperCss } from "@mrnote/core/web/lib/presentation-vertical-anchor.ts";
import { anchorCssForColumns } from "@mrnote/core/web/lib/presentation-text-columns.ts";
import { balanceOverflowingColumns } from "../../../../lib/presentation/text-columns-overflow";
import { textBodyRotationCss } from "@mrnote/core/web/lib/presentation-shape-text-rect.ts";
import { resolveTextBoxFill, textBoxFillCss, textBoxNativeGeometry } from "@mrnote/core/web/lib/presentation-text-fill.ts";
import { PresentationTextBoxGeometry } from "./PresentationTextBoxGeometry";
import { PresentationTextBoxEffectLayers, presentationTextBoxHostCss } from "./PresentationTextBoxEffects";
import { presentationTextBoxEffectsLook } from "../../../../lib/presentation-text-box-effects";
import { normalizeCellStyle } from "@mrnote/core/web/lib/presentation-table-style.ts";
import { normalizeEmbedKind } from "@mrnote/core/web/lib/presentation-embed.ts";
import { withFooterFieldStacking } from "@mrnote/core/web/lib/presentation-paint-order.ts";
import {
  blockAnimationClassName,
  isPresentationActionButtonShapeKind,
  normalizePresentationClickAction,
  normalizePresentationRelativeClickAction,
  parseSlideLinkTarget,
  sanitizeBlockHref,
  type PresentationClickAction,
} from "@mrnote/core/web/lib/presentation-block-fx.ts";
import {
  hasLayoutGeometry,
  isImportedPptxBlock,
  isPresentationCameoBlock,
} from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { isTextBoxBlock } from "@mrnote/core/web/lib/presentation-slide-buttons.ts";
import {
  DEFAULT_STEP_DURATION_MS,
  presentationAnimationEffect,
} from "@mrnote/core/web/lib/presentation-anim-timeline.ts";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import { resolveSlideMaster, type SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import { readZoomTileMarker } from "../../../../lib/presentation-zoom";
import { presentationBlockFrameOverflow } from "../../../../lib/presentation/block-frame-overflow";
import { presentationBlockIsPlaceholder, presentationSlideInk } from "../../../../lib/presentation/slide-ink";
import type {
  PresentationBlock,
  PresentationShapeBlock,
  PresentationTableBlock,
  PresentationTextBlock,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { asRecord } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import {
  textBlockTabSizeCss,
  textBlockLineBreakCss,
  textBlockOverflowWrap,
  textBlockWraps,
  importedPptxTextOverflow,
  textBlockDrawsInsets,
  textBlockInsetsCss,
  importedPptxTextInsetsCss,
} from "../../../../lib/presentation/text-layout-css";
import { PresentationLetterPlayContext } from "./PresentationRunsText";
import { PresentationTableShadowFrame } from "./PresentationTableShadowFrame";
import { PresentationShapeGraphic, presentationShapeReflectionCss } from "./PresentationShapeGraphic";
import { PresentationCameoGraphic } from "./PresentationCameo";
import { blockGeometryStyle, presentationSmartArtFaceSpan } from "../../../../lib/presentation/selection-geometry";
import {
  PresentationParagraphPlayContext,
  chartPlayCss,
  presentationParagraphFlyOffsetVars,
  playKeyframeName,
  playTimingFunction,
  PRESENTATION_AFTER_HIDE_KEYFRAME,
  activeBlockColorEffect,
  presentationFlyOffsetVars,
  PRESENTATION_BLOCK_BASE_TRANSFORM_VAR,
  type BlockPlayState,
} from "../../../../lib/presentation/block-play";
import { ShapeTextOverlay } from "./PresentationShapeTextOverlay";
import { isSmartArtGraphicPlate, smartArtGraphicPlateStyle } from "../../../../lib/presentation/smartart-graphic-plate";
import {
  tableCellStatedHeightPx,
  tableCellVisualTextStyle,
  tableCellTdStyle,
  TableCellCompoundEdges,
  TableColgroup,
  tableLayoutStyle,
  tableDirectionProps,
  tableRowHeightStyles,
  tableWithFrameAlignedGrid,
  tableOuterLineHalvesCss,
} from "../../../../lib/presentation/table-canvas-layout";
import {
  importedPptxPictureFrameStyle,
  PresentationEmbedContent,
  CroppedImageContent,
} from "./PresentationMediaContent";
import { PresentationModel3dFrame } from "./PresentationModel3dFrame";
import { presentationChartHostBackground, PresentationChartVisual } from "./PresentationChartVisual";
import {
  presentationTextVisualLayout,
  PresentationTextVisualContents,
} from "./PresentationTextVisual";
import { useOfficeDataVersion } from "@mrnote/core/web/lib/office-data/use-office-data.ts";
import { smartArtCameraWithOwnTransform } from "@mrnote/core/web/lib/office-smartart/canvas-3d.ts";

/**
 * Office shows the semantic placeholder size in its ribbon even before the
 * user types the first character. Our placeholders intentionally keep their
 * default look in CSS until edited, so expose the matching authoring value for
 * an EMPTY placeholder instead of leaving the font-size control blank.
 */
/**
 * Renders a shape block (rectangle / ellipse via CSS box; line / arrow via
 * SVG). Pure presentational component shared by the editor canvas and the
 * read-only present overlay so both surfaces draw shapes identically. The fill /
 * stroke / kind are resolved through the shared `resolveShapeStyle` helper.
 */
/**
 * The labelled caption overlaid on a ZOOM tile (a shape block carrying the
 * `zoomKind`/`zoomTargetId` markers). Rendered ABOVE the shape graphic in both
 * present + edit modes so the tile reads as a named navigation thumbnail. Absent
 * for a plain shape (no zoom markers) so non-zoom shapes are unchanged.
 */
export function ZoomTileLabel({ block }: { block: PresentationShapeBlock }) {
  const marker = readZoomTileMarker(block);
  const label = typeof block.text === "string" ? block.text : "";
  // A Slide Zoom carries no words: it shows its target slide's picture.
  if (!marker || !label) return null;
  return (
    <span
      className="presentation-zoom-tile__label"
      data-testid="presentation-zoom-tile-label"
      data-zoom-kind={marker.zoomKind}
    >
      {label}
    </span>
  );
}

/**
 * Read-only render of a single block for Present mode. Mirrors the editor's
 * block rendering (geometry, text styling, tables, charts, images) but strips
 * all editing affordances so present mode never mutates slide data.
 */
/**
 * "none" when the chart area states No Fill, else "set": the chart's hosts
 * (the canvas block, the show) paint their own white sheet unless the chart
 * area is explicitly transparent, which must let the slide show through
 * (PPT-B358).
 */
/**
 * One run of a table cell as the show draws it: its marker (a native
 * paragraph's bullet or number, PPT-B373) before its text, and the text as a
 * link when the run carries one (PPT-B371) -- the click follows the link and
 * does not advance the show.
 */
/**
 * A cell run's characters as the show draws them: its symbol-encoded
 * characters in its symbol font (`a:sym`) and every other one in the run's
 * own face, as a text box's run draws them (`withSymbolFont`).
 */
function cellRunDisplay(run: { text: string; style?: RunStyle }): ReactNode {
  const family = cellRunSymbolFontFamily(run.style);
  if (!family) return cellDisplayText(run.text);
  const pieces = cellRunSymbolPieces(run.text);
  if (!pieces.some((piece) => piece.symbol)) return cellDisplayText(run.text);
  return pieces.map((piece, index) =>
    piece.symbol ? (
      <span key={index} data-run-symbol-font="" style={{ fontFamily: family, lineHeight: 0 }}>
        {piece.text}
      </span>
    ) : (
      <Fragment key={index}>{cellDisplayText(piece.text)}</Fragment>
    ),
  );
}

function presentationShowTableRun(
  run: { text: string; style?: RunStyle; marker?: unknown; math?: { latex: string; display?: boolean } },
  index: number,
  style: CSSProperties,
): ReactElement {
  if (run.math) {
    // An equation in a cell (PPT-A052): drawn by KaTeX, as in a text box.
    return (
      <PresentationMathRun
        key={index}
        text={run.text}
        latex={run.math.latex}
        display={run.math.display === true}
        runIndex={index}
        style={style}
      />
    );
  }
  const marker = typeof run.marker === "string" && run.marker ? run.marker : null;
  const href = normalizeRunHyperlink(run.style?.href);
  const external = href && /^(?:https?:|mailto:)/i.test(href) ? href : null;
  return (
    <span key={index} style={style} data-run-text-paint={run.style?.textPaint ? "true" : undefined}>
      {marker ? <span data-testid="presentation-present-table-marker">{marker}</span> : null}
      {external ? (
        <a
          href={external}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="presentation-present-table-link"
          style={{ color: "inherit", pointerEvents: "auto" }}
          onClick={(event) => event.stopPropagation()}
        >
          {cellRunDisplay(run)}
        </a>
      ) : (
        cellRunDisplay(run)
      )}
    </span>
  );
}

function PresentationBlockViewDrawing({
  block,
  bounds,
  theme,
  slide,
  masters,
  play,
  slideIds,
  onNavigateToSlide,
  onClickAction,
  isTrigger = false,
  onTriggerClick,
  fillParent = false,
  staticMedia = false,
  showAnimations = true,
  smartArtCamera,
  decorativeGroup = false,
  editingSlots = false,
}: {
  block: PresentationBlock;
  bounds: { width: number; height: number };
  /** Deck-level theme supplying default text colour / font (override-aware). */
  theme?: DeckTheme;
  /** The owning slide (carries `masterId` for inheritance). */
  slide?: { masterId?: string; blocks?: readonly PresentationBlock[] };
  /** Deck-level masters the slide may inherit from. */
  masters?: readonly SlideMaster[];
  /**
   * This block is an INTERACTIVE TRIGGER on its slide: a triggered timeline step
   * starts "on click of" it. When true (and `onTriggerClick` is set) a present-
   * mode click fires the trigger instead of advancing the stage. Default false →
   * the block renders + behaves exactly as before.
   */
  isTrigger?: boolean;
  /** Fire this block's trigger (present-mode click). Paired with `isTrigger`. */
  onTriggerClick?: (blockId: string) => void;
  /**
   * Animation-timeline play state. Absent → the block is not scripted on the
   * timeline and renders with its own `block.animation` enter fx, as before.
   */
  play?: BlockPlayState;
  /**
   * The ids of every slide in the deck — used to validate an internal
   * `slide://` link against an EXISTING slide before wiring its in-app jump.
   * Absent → only the strict scheme + id shape is enforced (a non-jumping no-op).
   */
  slideIds?: ReadonlySet<string>;
  /** Jump to a slide by id (internal `slide://` link click in present mode). */
  onNavigateToSlide?: (slideId: string) => void;
  /** Execute a strict Action Button click in present mode. */
  onClickAction?: (action: PresentationClickAction) => void;
  /**
   * MORPH-layer mode: when true the block's own geometry style is REPLACED with an
   * absolute "fill the parent" rect (inset 0, 100% size) AND its entrance animation
   * class is suppressed — the morph wrapper owns positioning + the FLIP tween, and
   * this view only contributes the block CONTENT. Default false → byte-for-byte the
   * historical present-mode render (geometry + entrance fx as persisted).
   */
  fillParent?: boolean;
  /** Thumbnail mode: embeds render as a static badge (see the slide view). */
  staticMedia?: boolean;
  /** False keeps the block in its final static state without entrance effects. */
  showAnimations?: boolean;
  /**
   * The SmartArt diagram camera for this member (styles 3d5-3d9), from
   * {@link presentationSmartArtCameraStyle}. Absent → no tilt, as before.
   */
  smartArtCamera?: {
    transform: string;
    transformOrigin: string;
    transformStyle: "preserve-3d";
  } | null;
  /** A member of a group or SmartArt graphic marked decorative as a whole
   * (`presentationDecorativeGroupIds`): skipped by assistive readers. */
  decorativeGroup?: boolean;
  /**
   * Drawn on the EDITING canvas (a cache-less diagram's laid-out shapes): an
   * empty SmartArt picture slot keeps its "insert picture" icon, as PowerPoint
   * shows it while editing. Everywhere else this view draws -- the show, the
   * rail, print and export -- the slot is its bare colour (TRIAGE S22).
   */
  editingSlots?: boolean;
}) {
  const fontAliases = useContext(PresentationFontAliasesContext);
  // Shrink text on overflow measured on the slide's drawing: draw again when it lands.
  useAutofitMeasureVersion();
  const t = useTranslations("console-notebooks");
  // A table naming a built-in style it does not carry draws from the served
  // gallery looks: draw again when they land.
  useOfficeDataVersion("presentation-table-styles");
  // An imported table's rows and words laid out by the text engine, on the
  // surfaces that draw with it (`presentationEngineTable`).
  const engineTableBlock = useMemo(
    () => (block.type === "table" ? tableWithFrameAlignedGrid(block as PresentationTableBlock) : null),
    [block],
  );
  const engineTable = usePresentationEngineTable(engineTableBlock);
  // Its rows under merged cells as PowerPoint sizes them: a merge's shortfall
  // on the last row it covers (`usePresentationMergedRowHeights`), where the
  // browser lays the rows out.
  const tableRef = useRef<HTMLTableElement | null>(null);
  const baseTableRowStyles = useMemo(
    () => (engineTableBlock ? tableRowHeightStyles(engineTableBlock) : []),
    [engineTableBlock],
  );
  const mergedTableRowStyles = usePresentationMergedRowHeights(
    tableRef,
    baseTableRowStyles,
    engineTableBlock,
    engineTableBlock !== null && engineTable.status !== "ok",
  );
  // Format Shape > Effects on a text box (a text box is a shape,
  // `lib/presentation-text-box-effects`): its 3-D turn is the box's own, so
  // it joins the object's transform below, which the effects compose with.
  const textBoxEffectsFilterId = `presentation-textbox-effects-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const textBoxEffects =
    block.type === "text"
      ? presentationTextBoxEffectsLook(block, {
          filterUrl: `url(#${textBoxEffectsFilterId})`,
          hasFrame: resolveTextBoxFill(block as PresentationTextBlock).hasBox,
        })
      : null;
  const geometry = hasLayoutGeometry(block);
  // The entrance-animation class is appended to the shared block className so it
  // plays on every block kind when the slide mounts in present mode. `none`
  // (the default) yields `null` and contributes nothing. Keyframes +
  // prefers-reduced-motion handling live in styles/native-page-window.css.
  //
  // When the block is on the slide's ANIMATION TIMELINE, the timeline drives it
  // instead: the static `block.animation` enter class is suppressed (so it
  // doesn't double-animate) and the timeline's current step animation + inline
  // delay/duration apply only on the mount where the block first becomes
  // revealed. An un-revealed timeline block is rendered hidden but in-layout.
  const timelineControlled = play?.timelineControlled ?? false;
  // A motion path plays only while the timeline-controlled block is animating and
  // not in the morph layer (which owns its own tween). Composed INLINE with the
  // entrance keyframe (see below) so the two effects coexist on one step.
  const motionKeyframe =
    !fillParent && timelineControlled && play?.animate
      ? play?.motionKeyframe
      : undefined;
  // More than one occurrence of this block plays on this mount (a fade on click
  // followed by a spin after-previous): every occurrence is composed into one
  // inline animation list below, at its own offset, so none is dropped.
  const composedOccurrences =
    !fillParent && timelineControlled && play?.animate && play.effects
      ? play.effects.length > 1
        ? play.effects
        : null
      : null;
  // In morph-layer mode the wrapper owns the tween, so this view must NOT add its
  // own entrance keyframe (it would replay every frame / fight the FLIP).
  //
  // When a MOTION PATH is also playing this mount, the entrance keyframe is moved
  // from its CSS CLASS to an inline `animation` shorthand that lists BOTH the
  // entrance and motion keyframes (a single `animation` declaration — class or
  // inline — cannot otherwise carry two keyframes). So we suppress the entrance
  // class here and rebuild it inline below.
  const animClass = !showAnimations
    ? null
    : fillParent
    ? null
    : timelineControlled
      ? play?.animate && !motionKeyframe && !composedOccurrences && !play.letterPlay
        ? blockAnimationClassName(play.animation)
        : null
      : blockAnimationClassName(block.animation);
  const hidden = !fillParent && timelineControlled && !play?.visible;
  const className = [
    "presentation-present__block",
    // The Morph layer's copy clips as the slide's object does.
    geometry ? "presentation-present__block--geometry" : null,
    hidden ? "presentation-present__block--pending" : null,
    // Marker for the prefers-reduced-motion reset. Timeline playback writes its
    // timing/effect inline (and a motion path writes the whole shorthand), so a
    // normal stylesheet rule cannot override it. Reuse the existing important
    // reset for every active timeline animation, not only motion paths.
    timelineControlled && play?.animate
      ? "presentation-present__block--motion"
      : null,
    animClass,
  ]
    .filter(Boolean)
    .join(" ");
  // Morph layer: replace the persisted geometry with an absolute "fill parent"
  // rect so the block content covers the morph wrapper (which owns positioning +
  // the FLIP tween). Outside morph, geometry is unchanged (byte-for-byte).
  const geometryStyle: CSSProperties | undefined = fillParent
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : withFooterFieldStacking(blockGeometryStyle(block, bounds), slide, block);
  // The SmartArt diagram camera multiplies IN FRONT of the member's own
  // rotate/flip, about the diagram's shared centre, exactly as the editor stage
  // composes it. Absent for every non-diagram block → byte-for-byte unchanged.
  // In the Morph layer the wrapper owns the place and size; a tilted diagram
  // member still turns about the diagram's centre, its own rotation after the
  // camera, as on the slide (the layer gives such a wrapper no transform).
  const fillCameraTransform =
    smartArtCamera && fillParent
      ? smartArtCameraWithOwnTransform(
          smartArtCamera,
          typeof blockGeometryStyle(block, bounds)?.transform === "string"
            ? (blockGeometryStyle(block, bounds)?.transform as string)
            : null,
        )
      : undefined;
  const baseStyle: CSSProperties | undefined =
    smartArtCamera && fillParent && geometryStyle
      ? {
          ...geometryStyle,
          transform: fillCameraTransform,
          transformOrigin: smartArtCamera.transformOrigin,
          transformStyle: smartArtCamera.transformStyle,
        }
      : smartArtCamera && geometryStyle && !fillParent
      ? {
          ...geometryStyle,
          transform: smartArtCameraWithOwnTransform(
            smartArtCamera,
            typeof geometryStyle.transform === "string" ? geometryStyle.transform : null,
          ),
          transformOrigin: smartArtCamera.transformOrigin,
          transformStyle: smartArtCamera.transformStyle,
        }
      : geometryStyle;
  // The effect keyframes compose their transform with the object's own
  // rotate / flip through this variable (withBlockBaseTransform), and with
  // the end state of emphasis effects an earlier group completed.
  const baseTransform = fillParent
    ? undefined
    : [
        typeof baseStyle?.transform === "string" &&
        baseStyle.transform !== "none"
          ? baseStyle.transform
          : "",
        textBoxEffects?.hostTurn ?? "",
        play?.settledTransform ?? "",
      ]
        .filter(Boolean)
        .join(" ") || undefined;
  // A turn an effect plays is a turn on screen, as PowerPoint plays it: the
  // object's mirror sits inside the effect's transform, so a block flipped on
  // one axis turns the effect's angle round. A Spin on a flipped arrow ran
  
  const mirrored =
    ((block as { flipH?: unknown }).flipH === true) !== ((block as { flipV?: unknown }).flipV === true);
  const transformedBaseStyle: CSSProperties | undefined =
    baseTransform || play?.settledOpacity
      ? ({
          ...baseStyle,
          ...(baseTransform
            ? {
                transform: baseTransform,
                [PRESENTATION_BLOCK_BASE_TRANSFORM_VAR]: baseTransform,
                ...(mirrored ? { "--mrai-ppt-turn": "-1" } : {}),
              }
            : {}),
          ...(play?.settledOpacity ? { opacity: Number(play.settledOpacity) } : {}),
        } as CSSProperties)
      : baseStyle;
  // A held recipe emphasis (a colour shift, bold, underline) stays on the block.
  const settledRecipeStyle = !fillParent ? play?.settledRecipeStyle : undefined;
  const flies =
    !fillParent &&
    timelineControlled &&
    play?.animate === true &&
    [play.animation, ...(play.effects ?? []).map((effect) => effect.animation)].some(
      (animation) => typeof animation === "string" && animation.startsWith("fly-"),
    );
  const flyVars = flies ? presentationFlyOffsetVars(geometryStyle) : null;
  const positionedStyle: CSSProperties | undefined = play?.settledMotionTranslate
    ? { ...transformedBaseStyle, ...flyVars, translate: play.settledMotionTranslate }
    : flyVars
      ? ({ ...transformedBaseStyle, ...flyVars } as CSSProperties)
      : transformedBaseStyle;
  const staticStyle: CSSProperties | undefined = settledRecipeStyle
    ? { ...positionedStyle, ...settledRecipeStyle }
    : positionedStyle;
  // Inline the timeline step's delay/duration so `with-previous` /
  // `after-previous` chains reveal at their cumulative offsets. Only set while
  // the block is animating; otherwise the CSS class defaults apply unchanged.
  let style: CSSProperties | undefined = staticStyle;
  if (composedOccurrences) {
    // One `animation` list carrying every occurrence in sequence order. The
    // first occurrence fills `both` (its start frame holds through its delay,
    // so an entrance keeps the object hidden until it begins); later ones fill
    // `forwards` only, so they do not paint their start frame over the earlier
    // occurrence while waiting, and hold their end frame once done. A later
    // entry in the list wins over an earlier one for the same property, which
    // is exactly the sequence order.
    const parts: string[] = [];
    composedOccurrences.forEach((occurrence, index) => {
      const timing = occurrence.timing;
      // Rewind when done playing: the end frame is not held.
      const fill = timing?.rewind
        ? index === 0
          ? "backwards"
          : "none"
        : index === 0
          ? "both"
          : "forwards";
      // An occurrence By word / By letter plays on the text's units.
      const effectName = occurrence.letters
        ? null
        : playKeyframeName(
            occurrence.animation,
            occurrence.effectOption,
            occurrence.recipeKeyframe,
          );
      if (effectName) {
        parts.push(
          `${effectName} ${occurrence.durationMs}ms ${timing?.timingFunction ?? playTimingFunction(occurrence.recipeKeyframe)} ${occurrence.delayMs}ms${timing ? ` ${timing.iterationCount} ${timing.direction}` : ""} ${fill}`,
        );
      }
      if (occurrence.motionKeyframe) {
        parts.push(
          `${occurrence.motionKeyframe} ${occurrence.durationMs}ms ease-in-out ${occurrence.delayMs}ms forwards`,
        );
      }
    });
    if (parts.length > 0) {
      style = { ...staticStyle, animation: parts.join(", ") };
      if (parts.length > 1) {
        // Two effects on one object at once (Grow/Shrink with Spin) both write
        // `transform`; composed additively they play together instead of the
        // later one replacing the earlier (PPT-B230). Only those two compose
        // that way: a fade after a fade writes `opacity`, and added, 0 + 1
        // left the object visible after its exit (PPT-B285); every other
        // effect replaces, in sequence order.
        (style as Record<string, unknown>).animationComposition = composedOccurrences
          .flatMap((occurrence) => {
            const id = presentationAnimationEffect(occurrence.animation)?.id;
            const mode = id === "spin" || id === "grow-shrink" ? "add" : "replace";
            return [
              ...(playKeyframeName(occurrence.animation, occurrence.effectOption, occurrence.recipeKeyframe) ? [mode] : []),
              ...(occurrence.motionKeyframe ? ["replace"] : []),
            ];
          })
          .join(", ");
      }
    }
  } else if (!fillParent && timelineControlled && play?.animate) {
    const delayMs = play.delayMs ?? 0;
    const durationMs = play.durationMs ?? DEFAULT_STEP_DURATION_MS;
    if (motionKeyframe) {
      // Compose the full `animation` shorthand inline so the motion path AND any
      // entrance/emphasis/exit keyframe play together over the step's duration.
      // The motion keyframe uses `forwards` fill so the block holds its END
      // position (PowerPoint motion paths leave the block at the path end); the
      // entrance keyframe keeps `both` to match its standalone behaviour. Both
      // share the step's duration + delay so they stay in sync.
      //
      const entranceName = play.animate && !play.letterPlay
        ? playKeyframeName(play.animation, play.effectOption, play.recipeKeyframe)
        : null;
      const timing = play.timing;
      const repeat = timing ? ` ${timing.iterationCount} ${timing.direction}` : "";
      const motionAnim = `${motionKeyframe} ${durationMs}ms ${timing?.timingFunction ?? "ease-in-out"} ${delayMs}ms${repeat} ${timing?.rewind ? "none" : "forwards"}`;
      const entranceAnim = entranceName
        ? `${entranceName} ${durationMs}ms ${timing?.timingFunction ?? playTimingFunction(play.recipeKeyframe)} ${delayMs}ms${repeat} ${timing?.rewind ? "backwards" : "both"}`
        : null;
      style = {
        ...staticStyle,
        animation: entranceAnim ? `${entranceAnim}, ${motionAnim}` : motionAnim,
      };
    } else {
      // A step By word / By letter plays on the text's units, not the block.
      const effectName = play.letterPlay
        ? null
        : playKeyframeName(play.animation, play.effectOption, play.recipeKeyframe);
      const timing = play.timing;
      style = {
        ...staticStyle,
        ...(effectName
          ? {
              animationName: effectName,
              animationTimingFunction: timing?.timingFunction ?? playTimingFunction(play.recipeKeyframe),
              animationFillMode: timing?.rewind ? "backwards" : "both",
              animationDelay: `${delayMs}ms`,
              animationDuration: `${durationMs}ms`,
              ...(timing
                ? {
                    animationIterationCount: timing.iterationCount,
                    animationDirection: timing.direction,
                  }
                : {}),
            }
          : {}),
      };
    }
  }
  if (!fillParent && timelineControlled && play?.animate && play.afterHideAtMs !== undefined) {
    // After animation: Hide After Animation (or an entrance that rewinds)
    // takes the object away the moment its effect has played.
    const hide = `${PRESENTATION_AFTER_HIDE_KEYFRAME} 1ms linear ${Math.max(0, Math.round(play.afterHideAtMs))}ms 1 normal forwards`;
    const current = style as Record<string, unknown> | undefined;
    if (typeof current?.animation === "string") {
      style = { ...style, animation: `${current.animation}, ${hide}` };
    } else if (typeof current?.animationName === "string") {
      const {
        animationName,
        animationTimingFunction,
        animationFillMode,
        animationDelay,
        animationDuration,
        animationIterationCount,
        animationDirection,
        ...rest
      } = current as Record<string, string | undefined>;
      style = {
        ...(rest as CSSProperties),
        animation: `${animationName} ${animationDuration} ${animationTimingFunction} ${animationDelay} ${animationIterationCount ?? "1"} ${animationDirection ?? "normal"} ${animationFillMode}, ${hide}`,
      };
    } else {
      style = { ...style, animation: hide };
    }
  }
  if (!fillParent && play?.backgroundLoop) {
    // Animate as Background (PPT-A134): the loop runs for as long as the
    // slide is shown, from the slide's start.
    style = {
      ...style,
      animation: `${play.backgroundLoop.keyframe} ${play.backgroundLoop.durationMs}ms linear 0ms infinite`,
    };
  }
  // The frame cuts exactly what the editor canvas's frame cuts at rest (one
  // rule, `presentationBlockFrameOverflow`): a picture style's reflection or
  // shadow, Picture Effects, a text box's WordArt and its overflowing words
  // all hang past the frame here as they do there. A flow block (no slide
  // geometry) keeps its own layout, a shape its visible outline.
  const frameOverflow = geometry
    ? presentationBlockFrameOverflow(block)
    : block.type === "shape"
      ? "visible"
      : undefined;
  if (frameOverflow) style = { ...style, overflow: frameOverflow };
  // Validate the persisted href at the render edge so a stale/unsafe value can
  // never produce a clickable dangerous link. An internal `slide://` target is
  // resolved against the live deck ids so a link to a deleted slide is inert.
  const safeHref = sanitizeBlockHref(block.href, slideIds);
  // Action Settings' "Highlight click" (`a:hlinkClick@highlightClick`): the
  // object flashes while it is clicked in the show.
  const clickHighlightClass =
    (block as { clickHighlight?: unknown }).clickHighlight === true
      ? " presentation-present__block-link--highlight"
      : "";
  // The link's ScreenTip (Insert Hyperlink > ScreenTip..., PPT-B010): what the
  // show shows when the pointer rests on the object.
  const screenTip = normalizeLinkTooltip(
    (block as { linkTooltip?: unknown }).linkTooltip,
  );
  // An internal slide link → the bare target slide id (validated to EXIST in the
  // deck). External / absent → null, so the block keeps the historical `<a href>`
  // navigation behavior.
  const slideLinkTarget = safeHref
    ? parseSlideLinkTarget(safeHref, slideIds)
    : null;
  let content: ReactNode;
  // Mark as Decorative: the object and all it holds are skipped by assistive
  // readers in the show, as PowerPoint's are -- its words too, not only its
  
  const decorativeAria =
    (block as { decorative?: unknown }).decorative === true || decorativeGroup
      ? ({ "aria-hidden": true } as const)
      : {};
  if (
    block.type === "image" &&
    !staticMedia &&
    asRecord(block.source)?.nativeNarrationIcon === true
  ) {
    // A recorded narration's speaker picture: PowerPoint shows it in Normal
    // view and in its PDF, and hides it in the show (`showWhenStopped="0"`).
    // The thumbnails (static media) still draw it.
    return null;
  }
  if (block.type === "image") {
    content = (
      <figure
        {...decorativeAria}
        className={`${className} presentation-present__image`}
        style={style}
        data-testid="presentation-present-image"
        data-presentation-block-id={block.id}
      >
        <PresentationModel3dFrame block={block} live={!staticMedia}>
        <CroppedImageContent
          block={block}
          themeColors={presentationThemeGridColors(theme, resolveSlideMaster(slide, masters))}
          fillParent={geometry}
          emptySlot={editingSlots ? "icon" : "fill"}
          imgStyle={{
            ...(importedPptxPictureFrameStyle(block, geometry) ?? {
              maxWidth: geometry
                ? "100%"
                : block.width
                  ? `${Math.min(block.width, 720)}px`
                  : undefined,
            }),
          }}
        />
        </PresentationModel3dFrame>
        {!geometry && block.caption ? <figcaption>{block.caption}</figcaption> : null}
      </figure>
    );
  } else if (block.type === "chart") {
    content = (
      <div
        {...decorativeAria}
        className={`${className} presentation-present__chart`}
        style={{
          ...style,
          display: "flex",
          flexDirection: "column",
          gap: 0,
          padding: 0,
          // An explicit No Fill chart area lets the slide show through, in
          // the show as on the canvas (PPT-B358); an imported chart draws
          // its own area. One rule with the canvas.
          background: presentationChartHostBackground(block, isImportedPptxBlock(block)),
        }}
        data-testid="presentation-present-chart"
        data-presentation-block-id={block.id}
      >
        {play?.chartPlay ? <style>{chartPlayCss(block.id, play.chartPlay)}</style> : null}
        <PresentationChartVisual block={block} />
      </div>
    );
  } else if (block.type === "table") {
    const displayedTable = engineTableBlock ?? tableWithFrameAlignedGrid(block);
    const displayedRowStyles =
      engineTable.status === "ok"
        ? engineTable.rowHeightsPx.map((height) => ({ height }))
        : mergedTableRowStyles;
    content = (
      <div
        {...decorativeAria}
        className={`${className} presentation-present__table`}
        style={style}
        data-testid="presentation-present-table"
        data-presentation-block-id={block.id}
      >
        {!geometry && block.caption ? <strong>{block.caption}</strong> : null}
        {engineTable.status === "pending" ? <span hidden {...{ [PRESENTATION_TEXT_ENGINE_ATTRIBUTE]: "pending" }} /> : null}
        <PresentationTableShadowFrame block={displayedTable}>
        <table
          ref={tableRef}
          style={{ ...tableLayoutStyle(displayedTable), ...tableOuterLineHalvesCss(displayedTable) }}
          {...tableDirectionProps(displayedTable)}
        >
          <TableColgroup block={displayedTable} />
          <tbody>
            {displayedTable.rows.map((row, rowIndex) => (
              <tr
                key={`present-row-${rowIndex}`}
                style={displayedRowStyles[rowIndex]}
              >
                {row.map((cell, cellIndex) => {
                  const cellStyle = normalizeCellStyle(cell);
                  // A header row's cells are column headers for assistive reading (PPT-B361).
                  const CellTag: "th" | "td" = block.headerRow === true && rowIndex === 0 ? "th" : "td";
                  return (
                    <CellTag
                      scope={CellTag === "th" ? "col" : undefined}
                      key={`present-cell-${rowIndex}-${cellIndex}`}
                      colSpan={cell.colspan}
                      rowSpan={cell.rowspan}
                      style={{
                        fontSize: "inherit",
                        padding: geometry ? "6px 10px" : 0,
                        minWidth: geometry ? 0 : 92,
                        ...tableCellTdStyle(displayedTable, cell, rowIndex, cellIndex),
                      }}
                    >
                      <TableCellCompoundEdges tdStyle={tableCellTdStyle(displayedTable, cell, rowIndex, cellIndex)} />
                      <div data-testid="presentation-static-table-cell" data-text-paint={cellStyle.textPaint ? "true" : undefined} style={{ ...tableCellVisualTextStyle(displayedTable, { ...cellStyle, superscript: false, subscript: false }, block.headerRow === true && rowIndex === 0, false, cell, tableCellStatedHeightPx(displayedTable, rowIndex, cell)), textDecoration: "none", backgroundColor: undefined,
                        // A word the engine let run past the cell, as PowerPoint draws it: over the cells after it,
                        // whose `<td>` a table drawing its own lines positions (`tableEdgeStrokePlan`), and their lines.
                        ...(engineTable.status === "ok" && engineTable.cells[rowIndex]?.[cellIndex] ? { overflow: "visible", position: "relative", zIndex: 7 } : {}) }}>
                        {engineTable.status === "ok" && engineTable.cells[rowIndex]?.[cellIndex] ? (
                          <PresentationEngineTableCellText cell={engineTable.cells[rowIndex][cellIndex]!} />
                        ) : (() => {
                          const drawRun = (run: ReturnType<typeof cellCharacterRuns>[number], index: number) =>
                            presentationShowTableRun(run, index, presentationCellTextRunCss(run.style, tableCellVisualTextStyle(displayedTable, { ...cellStyle, superscript: false, subscript: false }, block.headerRow === true && rowIndex === 0, false, cell), { superscript: cellStyle.superscript, subscript: cellStyle.subscript }));
                          const runs = cellCharacterRuns(cell.text, cell.runs);
                          // The paragraphs' bullets and indents (`textLayout`, look
                          
                          const paragraphs = presentationTableCellParagraphStyles(cell, cell.text);
                          if (!paragraphs) {
                            // An empty last paragraph is a line of its end mark's size, the row
                            
                            // block of the mark's own type (its line box stands on it, not on the
                            // cell's), as the canvas's field draws it.
                            const trailing = presentationTableCellTrailingParagraphStyle(displayedTable, cell);
                            if (!trailing) return runs.map(drawRun);
                            const mark = presentationCellTextRunCss(trailing, tableCellVisualTextStyle(displayedTable, { ...cellStyle, superscript: false, subscript: false }, block.headerRow === true && rowIndex === 0, false, cell), { superscript: cellStyle.superscript, subscript: cellStyle.subscript });
                            return [
                              ...runs.map(drawRun),
                              <span key="trailing-paragraph" data-cell-paragraph-tail="" style={{ display: "block", fontSize: mark.fontSize, fontFamily: mark.fontFamily }}>{"\u200b"}</span>,
                            ];
                          }
                          const breakStyles = presentationTableCellParagraphBreakStyles(runs);
                          return presentationTableCellRunParagraphs(runs).map((paragraph, paragraphIndex) => {
                            const drawn = paragraphs[Math.min(paragraphIndex, paragraphs.length - 1)];
                            return (
                              <div key={`p-${paragraphIndex}`} style={drawn.block}>
                                {drawn.marker ? <span data-testid="presentation-present-table-marker" style={drawn.marker.css}>{drawn.marker.text}</span> : null}
                                {/* An empty paragraph stands on its end mark (the size its closing break carries, readings row 807). */}
                                {paragraph.length ? paragraph.map(drawRun) : drawRun({ text: "\u200b", style: breakStyles[paragraphIndex] }, 0)}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </CellTag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </PresentationTableShadowFrame>
      </div>
    );
  } else if (block.type === "shape") {
    const fillColorEffect = activeBlockColorEffect(play, "fill-color");
    const strokeColorEffect = activeBlockColorEffect(play, "line-color");
    const textColorEffect = activeBlockColorEffect(play, "font-color");
    const activeFillColor = fillColorEffect?.color;
    const activeStrokeColor = strokeColorEffect?.color;
    const activeTextColor = textColorEffect?.color;
    // Shape Effects > Reflection reflects the drawing and its words
    
    const shapeReflection = isPresentationCameoBlock(block) ? null : presentationShapeReflectionCss(block);
    content = (
      <div
        className={`${className} presentation-present__shape`}
        style={{
          ...style,
          ...(shapeReflection ? ({ WebkitBoxReflect: shapeReflection } as CSSProperties) : {}),
          ...presentationShapeBlendCss(block as { type?: unknown; blendMode?: unknown }),
        }}
        data-testid="presentation-present-shape"
        data-presentation-block-id={block.id}
        data-shape={normalizeShapeKind(block.shape)}
        data-zoom-kind={readZoomTileMarker(block)?.zoomKind}
        // The author's alternative text reaches assistive readers in the show
        // (its drawing is aria-hidden); a decorative shape stays silent, its
        
        {...(typeof block.alt === "string" && block.alt.trim() && block.decorative !== true
          ? { role: "img", "aria-label": block.alt.trim() }
          : {})}
        {...decorativeAria}
      >
        {isPresentationCameoBlock(block) ? (
          <PresentationCameoGraphic
            block={block}
            interactive={!staticMedia}
            t={t}
          />
        ) : (
          <>
            <PresentationShapeGraphic
              block={block}
              fillOverride={play?.settledFillColor}
              strokeOverride={play?.settledStrokeColor}
              reflectionOutside={Boolean(shapeReflection)}
              smartArtFaceSpan={
                block.shape3d?.material === "metal" || block.scene3d?.lightRig.rig === "balanced"
                  ? presentationSmartArtFaceSpan(slide?.blocks, block)
                  : null
              }
            />
            {activeFillColor ? (
              <span
                aria-hidden="true"
                className="presentation-present__shape-fill-overlay"
                data-testid="presentation-present-shape-fill-overlay"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  animationName: fillColorEffect?.keyframe ?? "mrai-ppt-effect-fill-color-overlay",
                  animationTimingFunction: "linear",
                  animationFillMode: "both",
                  animationDelay: `${fillColorEffect?.delayMs ?? 0}ms`,
                  animationDuration: `${fillColorEffect?.durationMs ?? DEFAULT_STEP_DURATION_MS}ms`,
                }}
              >
                <PresentationShapeGraphic
                  block={block}
                  fillOverride={activeFillColor}
                  suppressOutline
                  reflectionOutside={Boolean(shapeReflection)}
                />
              </span>
            ) : null}
            {activeStrokeColor ? (
              <span
                aria-hidden="true"
                className="presentation-present__shape-line-overlay"
                data-testid="presentation-present-shape-line-overlay"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  animationName: strokeColorEffect?.keyframe ?? "mrai-ppt-effect-fill-color-overlay",
                  animationTimingFunction: "linear",
                  animationFillMode: "both",
                  animationDelay: `${strokeColorEffect?.delayMs ?? 0}ms`,
                  animationDuration: `${strokeColorEffect?.durationMs ?? DEFAULT_STEP_DURATION_MS}ms`,
                }}
              >
                <PresentationShapeGraphic
                  block={block}
                  strokeOverride={activeStrokeColor}
                  suppressFill
                  reflectionOutside={Boolean(shapeReflection)}
                />
              </span>
            ) : null}
            <ZoomTileLabel block={block} />
            <ShapeTextOverlay
              block={block}
              colorOverride={play?.settledTextColor}
              slideIds={slideIds}
              onNavigateToSlide={onNavigateToSlide}
            />
            {activeTextColor ? (
              <span
                inert
                aria-hidden="true"
                className="presentation-present__text-color-overlay"
                data-testid="presentation-present-shape-text-color-overlay"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  animationName: textColorEffect?.keyframe ?? "mrai-ppt-effect-fill-color-overlay",
                  animationTimingFunction: "linear",
                  animationFillMode: "both",
                  animationDelay: `${textColorEffect?.delayMs ?? 0}ms`,
                  animationDuration: `${textColorEffect?.durationMs ?? DEFAULT_STEP_DURATION_MS}ms`,
                }}
              >
                <ShapeTextOverlay
                  block={block}
                  colorOverride={activeTextColor}
                />
              </span>
            ) : null}
          </>
        )}
      </div>
    );
  } else if (block.type === "embed") {
    content = (
      <div
        className={`${className} presentation-present__embed`}
        style={style}
        data-testid="presentation-present-embed"
        data-presentation-block-id={block.id}
        data-embed-kind={normalizeEmbedKind(block.kind)}
      >
        {staticMedia ? (
          // Thumbnail: the clip's still face (poster frame or play mark,
          // speaker icon), never a live player -- a rail of thumbnails must
          // not mount iframes or fetch video metadata once per slide.
          <PresentationEmbedContent
            block={block}
            fillParent={geometry}
            interactive={false}
            staticFace
            t={t}
            themeColors={block.kind === "video" ? presentationThemeGridColors(theme, resolveSlideMaster(slide, masters)) : null}
          />
        ) : (
          <PresentationEmbedContent
            block={block}
            fillParent={geometry}
            interactive
            t={t}
            themeColors={block.kind === "video" ? presentationThemeGridColors(theme, resolveSlideMaster(slide, masters)) : null}
          />
        )}
      </div>
    );
  } else {
    const isTextBox = isTextBoxBlock(block);
    const layout = presentationTextVisualLayout(block, bounds, slide, masters, theme, fontAliases);
    const { paragraphTextStyles, columnsCss } = layout;
    const anchorCss = verticalAnchorWrapperCss(
      readVerticalAnchor((block as PresentationTextBlock).style),
      readSpacingFromStyle((block as PresentationTextBlock).style as Record<string, unknown> | undefined)?.writingMode,
    );
    const textBoxFill = resolveTextBoxFill({
      ...(block as PresentationTextBlock),
      ...(play?.settledFillColor ? { fill: play.settledFillColor, fillTo: undefined } : {}),
      ...(play?.settledStrokeColor ? { outlineColor: play.settledStrokeColor, outlineColorTo: undefined } : {}),
    });
    const textGeometry = textBoxNativeGeometry(block);
    const fillCss = textBoxFillCss(textBoxFill, { onGeometry: textGeometry !== null });
    const activeBoxColor = play?.animate &&
      (play.animation === "fill-color" || play.animation === "line-color")
      ? play.effectColor : undefined;
    // The two custom properties feed the `mrai-ppt-text-*-color` keyframes.
    const boxColorAnimation: CSSProperties & {
      "--mrai-ppt-color-from"?: string;
      "--mrai-ppt-color-to"?: string;
    } = activeBoxColor ? {
      animationName: play?.animation === "fill-color" ? "mrai-ppt-text-fill-color" : "mrai-ppt-text-line-color",
      "--mrai-ppt-color-from": play?.animation === "fill-color" ? (textBoxFill.fill ?? "transparent") : textBoxFill.outlineColor,
      "--mrai-ppt-color-to": activeBoxColor,
      ...(play?.animation === "fill-color" ? { backgroundImage: "none" } : { borderImage: "none" }),
    } : {};
    const textColorEffect = activeBlockColorEffect(play, "font-color");
    const activeTextColor = textColorEffect?.color;
    // An imported block's indent is drawn by its inset padding on the frame
    // (`importedPptxTextInsetsCss`), as the editor draws it; the body must
    // not add the same rungs a second time.
    // The box's WordArt effects (its `filter`: shadow, glow, outline
    // offsets) are drawn on every row (`PresentationTextVisualContents`);
    // the body around the rows must not draw them again -- filters compound,
    
    const containerWithoutRowEffects: CSSProperties =
      (block as { textPaint?: unknown }).textPaint && paragraphTextStyles.containerStyle.filter !== undefined
        ? { ...paragraphTextStyles.containerStyle, filter: undefined }
        : paragraphTextStyles.containerStyle;
    const bodyContainerStyle: CSSProperties = isImportedPptxBlock(block)
      ? { ...containerWithoutRowEffects, paddingLeft: undefined }
      : containerWithoutRowEffects;
    // A body flowing in columns fills each column to the box's foot before the
    // next, which needs the box's height: a body as tall as its words kept all
    
    // is anchored as the editor's column body is (`anchorCssForColumns`).
    const columnBodyCss: CSSProperties =
      typeof columnsCss.columnCount === "number" && columnsCss.columnCount > 1
        ? {
            height: "100%",
            boxSizing: "border-box",
            alignContent: anchorCssForColumns(anchorCss, columnsCss).alignContent,
          }
        : {};
    // The inset padding is a percentage of the box it sits in: the slide for
    // the slide's object, the object's own frame for the Morph layer's copy
    // (whose wrapper is that frame). Measured from the slide there, every
    // inset shrank to the frame's share of the slide and the words moved up
    // and left while the transition played.
    const insetReferenceWidth = fillParent ? undefined : bounds.width;
    const renderTextBody = (colorOverride?: string): ReactElement => (
      // The text BODY: `splitParagraphListTextStyle` resolves colour, family,
      // size and weight here and leaves only line/before/after spacing on each
      // row, so this is the element that answers "what does this block's text
      // look like". Named because a single `<p>` carried both halves before
      // `6b108cba7b` put the canvas and the thumbnails on one renderer.
      <div ref={balanceOverflowingColumns} data-testid="presentation-text-body" dir={(block as { dir?: unknown }).dir === "rtl" ? "rtl" : undefined} style={{ ...bodyContainerStyle, ...columnsCss, ...columnBodyCss, whiteSpace: textBlockWraps(block) ? "pre-wrap" : "pre", overflowWrap: textBlockOverflowWrap(block), ...textBlockTabSizeCss(block),
                                ...textBlockLineBreakCss(block), ...(isImportedPptxBlock(block) ? textBodyRotationCss((block as { source?: unknown }).source, "content", block) : {}) }}>
        <PresentationTextVisualContents block={block as PresentationTextBlock} layout={layout} colorOverride={colorOverride} slideIds={slideIds} onNavigateToSlide={onNavigateToSlide} />
      </div>
    );
    content = (
      <div
        {...decorativeAria}
        className={`${className} presentation-present__text${
          isTextBox ? " presentation-present__textbox" : ""
        }`}
        style={{
          ...style,
          // A placeholder's words that state no colour draw in the
          // placeholder ink, as the canvas draws them.
          ...(geometry && presentationBlockIsPlaceholder(block) ? { color: presentationSlideInk(theme, resolveSlideMaster(slide, masters)) } : {}),
          ...presentationTextBoxHostCss(textBoxEffects, fillCss),
          ...(textBoxEffects?.frameLayer && !style?.position ? { position: "relative" } : {}),
          ...anchorCss,
          ...boxColorAnimation,
          ...(isImportedPptxBlock(block)
            ? { ...importedPptxTextInsetsCss(block, insetReferenceWidth), boxSizing: "border-box" }
            : textBlockDrawsInsets(block)
              ? { ...textBlockInsetsCss(block, insetReferenceWidth), boxSizing: "border-box" }
              : {}),
        }}
        data-testid={
          isTextBox
            ? "presentation-present-textbox"
            : "presentation-present-text"
        }
        data-presentation-block-id={block.id}
      >
        <PresentationTextBoxEffectLayers look={textBoxEffects} filterId={textBoxEffectsFilterId} frameCss={fillCss}>
          {textGeometry ? <PresentationTextBoxGeometry block={block} fill={textBoxFill} /> : null}
        </PresentationTextBoxEffectLayers>
        {renderTextBody(play?.settledTextColor)}
        {activeTextColor ? (
          <div
            inert
            aria-hidden="true"
            className="presentation-present__text-color-overlay"
            data-testid="presentation-present-text-color-overlay"
            style={{
              position: "absolute",
              inset: 0,
              padding: "inherit",
              // The frame's insets are a share of the SLIDE's width; inherited
              // here they resolved against the frame's, and the new colour's
              // words sat up and to the left of the old ones, a second copy
              
              // frame this overlay fills, they land on the words below.
              ...(isImportedPptxBlock(block)
                ? importedPptxTextInsetsCss(block)
                : textBlockDrawsInsets(block)
                  ? textBlockInsetsCss(block)
                  : {}),
              boxSizing: "border-box",
              pointerEvents: "none",
              ...anchorCss,
              ...(isImportedPptxBlock(block)
                ? { overflow: importedPptxTextOverflow(block) }
                : {}),
              animationName: textColorEffect?.keyframe ?? "mrai-ppt-effect-fill-color-overlay",
              animationTimingFunction: "linear",
              animationFillMode: "both",
              animationDelay: `${textColorEffect?.delayMs ?? 0}ms`,
              animationDuration: `${textColorEffect?.durationMs ?? DEFAULT_STEP_DURATION_MS}ms`,
            }}
          >
            {renderTextBody(activeTextColor)}
          </div>
        ) : null}
      </div>
    );
  }
  // An INTERNAL slide link (`slide://<id>` referencing an existing slide) wraps
  // the block in an in-app jump control instead of a navigable anchor: clicking
  // jumps to the target slide WITHOUT leaving the deck / opening a tab. Rendered
  // INTERACTIVE TRIGGER (PowerPoint "Trigger → On Click of"): this block fires a
  // triggered timeline step when clicked in present mode. Wrap it in a
  // role="button" span whose click FIRES the trigger and STOPS propagation, so
  // the stage's background advance handler never also runs (the click reveals the
  // triggered effect WITHOUT advancing the normal sequence). Takes precedence
  // over a slide-link / href on the same block (firing the trigger is the primary
  // interactive intent). Keyboard-activatable for parity with the slide-link.
  // A letter-by-letter effect: the block's text draws one animated box per
  // letter on the mount the effect plays.
  if (!fillParent && play?.animate && play.letterPlay) {
    content = (
      <PresentationLetterPlayContext.Provider value={play.letterPlay}>
        {content}
      </PresentationLetterPlayContext.Provider>
    );
  }
  // An imported By Paragraph build: the rows of this block's text read their
  // own play state (hidden until their click, then their effect).
  // The Morph layer passes the rows' settled state only (nothing plays there),
  // so a row the build has not revealed stays hidden through the transition.
  if (
    play?.paragraphPlay &&
    (!fillParent || [...play.paragraphPlay.values()].every((row) => !row.animate)) &&
    (block.type === "text" || block.type === "shape")
  ) {
    content = (
      <PresentationParagraphPlayContext.Provider
        value={{
          rows: play.paragraphPlay,
          flyVars: presentationParagraphFlyOffsetVars(geometryStyle),
        }}
      >
        {content}
      </PresentationParagraphPlayContext.Provider>
    );
  }
  // Action Settings > Mouse Over (`a:hlinkMouseOver`, PPT-B012): pointing
  // at the object in the show jumps. A web address is not opened -- a browser
  // opens no window without a click.
  const hoverHref = sanitizeBlockHref(
    (block as { hoverHref?: unknown }).hoverHref,
    slideIds,
  );
  const hoverSlide = hoverHref ? parseSlideLinkTarget(hoverHref, slideIds) : null;
  const hoverAction = normalizePresentationRelativeClickAction(
    (block as { hoverAction?: unknown }).hoverAction,
  );
  if ((hoverSlide && onNavigateToSlide) || (hoverAction && onClickAction)) {
    const hoverHighlight =
      (block as { hoverHighlight?: unknown }).hoverHighlight === true;
    content = (
      <span
        className={`presentation-present__block-link${hoverHighlight ? " presentation-present__block-link--hover-highlight" : ""}`}
        data-testid="presentation-present-hover-action"
        onMouseEnter={() => {
          if (hoverAction) onClickAction?.(hoverAction);
          else if (hoverSlide) onNavigateToSlide?.(hoverSlide);
        }}
      >
        {content}
      </span>
    );
  }
  if (isTrigger && onTriggerClick) {
    const fire = (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onTriggerClick(block.id);
    };
    return (
      <span
        role="button"
        tabIndex={0}
        className="presentation-present__block-trigger"
        data-testid="presentation-present-block-trigger"
        data-trigger-block-id={block.id}
        onClick={fire}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fire(event);
          }
        }}
      >
        {content}
      </span>
    );
  }
  // Any object's Action Settings may jump relative (PPT-B012); a media
  // action is an Action Button's own.
  const rawClickAction = (block as { clickAction?: unknown }).clickAction;
  const clickAction =
    block.type === "shape"
      ? normalizePresentationClickAction(rawClickAction)
      : normalizePresentationRelativeClickAction(rawClickAction);
  const actionButtonKind =
    block.type === "shape" ? normalizeShapeKind(block.shape) : null;
  // A labelled button ("Back to board", a quiz's answer) is named by its
  // words, as its own label reads.
  const actionButtonLabel =
    block.type === "shape" && typeof (block as { text?: unknown }).text === "string"
      ? (block as { text: string }).text.replace(/\s+/g, " ").trim()
      : "";
  const actionButtonAccessibleName =
    isPresentationActionButtonShapeKind(actionButtonKind)
      ? actionButtonLabel || t(`presentation.shape.${actionButtonKind}`)
      : undefined;
  // A linked picture is named by its description, as the picture is: the
  
  const pictureLinkName =
    block.type === "image" && !(block as { decorative?: unknown }).decorative &&
    typeof (block as { alt?: unknown }).alt === "string" && (block as { alt: string }).alt.trim()
      ? (block as { alt: string }).alt.trim()
      : undefined;
  if (clickAction && onClickAction) {
    const accessibleName =
      actionButtonAccessibleName ??
      t("presentation.shapeGallery.category.action-buttons");
    const dispatch = (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onClickAction(clickAction);
    };
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={accessibleName}
        title={screenTip}
        className={`presentation-present__block-link presentation-present__block-link--action${clickHighlightClass}`}
        data-testid="presentation-present-action-button"
        data-action-target={
          clickAction.kind === "relative-slide"
            ? clickAction.target
            : clickAction.targetBlockId
        }
        onClick={dispatch}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            dispatch(event);
          }
        }}
      >
        {content}
      </span>
    );
  }
  // as a <span role="link"> (not <a href>) so it can never navigate; the click
  // both jumps and stops propagation so the stage's advance handler is bypassed.
  if (slideLinkTarget && onNavigateToSlide) {
    const jump = (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onNavigateToSlide(slideLinkTarget);
    };
    return (
      <span
        role="link"
        tabIndex={0}
        aria-label={actionButtonAccessibleName ?? pictureLinkName}
        title={screenTip}
        className={`presentation-present__block-link presentation-present__block-link--slide${clickHighlightClass}`}
        data-testid="presentation-present-block-link"
        data-slide-link={slideLinkTarget}
        onClick={jump}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            jump(event);
          }
        }}
      >
        {content}
      </span>
    );
  }
  // A validated EXTERNAL block hyperlink wraps the rendered block in a safe
  // anchor. The scheme whitelist (http/https/mailto) is enforced by
  // sanitizeBlockHref, and rel="noopener noreferrer" + target="_blank" prevent
  // tab-nabbing. (An internal `slide://` href is never reachable here: it was
  // intercepted above; absent a jump handler it renders as a plain block.)
  if (safeHref && !slideLinkTarget) {
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={actionButtonAccessibleName ?? pictureLinkName}
        title={screenTip}
        className="presentation-present__block-link"
        data-testid="presentation-present-block-link"
        // The audience stage owns onClick={onAdvance}; a hyperlink click must
        // open the link WITHOUT also bubbling up to advance the slide/timeline.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.click();
          }
        }}
      >
        {content}
      </a>
    );
  }
  return content;
}







/**
 * A file's SmartArt graphic's own fill, line and effect across its frame
 * (`smartart-graphic-plate`): a display object, painted and hidden with its
 * diagram, never taking a press; anything else is drawn as a block.
 */
function PresentationBlockViewOrPlate(props: Parameters<typeof PresentationBlockViewDrawing>[0]) {
  if (!isSmartArtGraphicPlate(props.block)) return <PresentationBlockViewDrawing {...props} />;
  if (props.play && !props.play.visible) return null;
  const style = smartArtGraphicPlateStyle(props.block, props.bounds);
  return style ? <div aria-hidden="true" data-testid="presentation-smartart-graphic-plate" style={style} /> : null;
}

export const PresentationBlockView = memo(PresentationBlockViewOrPlate, sameBlockViewProps);
PresentationBlockView.displayName = "PresentationBlockView";

/** The same props, the slide's bounds by their size: hosts compute them
 * again at every render (a new object of the same width and height). */
function sameBlockViewProps(
  previous: Parameters<typeof PresentationBlockViewDrawing>[0],
  next: Parameters<typeof PresentationBlockViewDrawing>[0],
): boolean {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof typeof next>;
  for (const key of keys) {
    if (Object.is(previous[key], next[key])) continue;
    if (key === "bounds" && previous.bounds && next.bounds &&
        previous.bounds.width === next.bounds.width && previous.bounds.height === next.bounds.height) continue;
    return false;
  }
  return true;
}
