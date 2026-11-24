"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Draws a whole slide: background, master/layout inheritance, the blocks in
 * paint order with their animation timeline, header/footer and overlays;
 * shared by the editor canvas, thumbnails and the slideshow.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { useOfficePatternAnchor } from "@mrnote/core/web/components/office-pattern/useOfficePatternAnchor.ts";
import {
  applyNativeTimingVisibility,
  endNativeTimingRun,
  nativeTimingTriggerBlocks,
  nativeTimingTriggerRuns,
  playNativeTimingClick,
  playNativeTimingRun,
  runNativeMediaCommand,
  slideNativeTimingTree,
} from "../../../../lib/presentation-native-timing-player";
import {
  PresentationOfficeThemeArtwork,
  deckDrawsOfficeThemeArtwork,
} from "./PresentationOfficeThemeArtwork";
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
import { presentationFontFamilyWithAssets, presentationServedBodyFontStyle } from "@mrnote/core/web/lib/presentation-font-faces.ts";
import { PresentationFontAliasesContext } from "./usePresentationFontFaces";
import { presentationAnimatedBackgroundPlay } from "../../../../lib/presentation-animated-background-play";
import { normalizeHexColor as normalizeOfficeHexColor } from "@mrnote/core/web/lib/office-color-palette.ts";
import {
  effectPlayDurationMs,
  effectRecipe,
  effectRecipeClass,
  effectRecipeColorLayer,
  effectRecipeKeyframeBody,
  effectRecipeKeyframeName,
  effectRecipeLetterStepMs,
  effectRecipeSettledStyle,
} from "@mrnote/core/web/lib/presentation-effect-recipes.ts";
import { effectTextUnitStepMs } from "@mrnote/core/web/lib/presentation-anim-effect-settings.ts";
import {
  BASIC_TRANSITION_DURATION_MS,
  clampTransitionDuration,
  normalizeSlideTransition,
} from "@mrnote/core/web/lib/presentation-transitions.ts";
import {
  resolveSlideBackgroundFill,
  slideBackgroundCss,
  normalizeSolidBackgroundTransparency,
} from "@mrnote/core/web/lib/presentation-slide-bg.ts";
import { isDrawableImageSource } from "@mrnote/core/web/lib/inline-image-source.ts";
import type { PresentationClickAction } from "@mrnote/core/web/lib/presentation-block-fx.ts";
import { geometryNumber, slideDrawnAsSlide, slideBounds, slideDimension } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import {
  isPresentationAnimationEffectId,
  partitionTimelineSteps,
  presentationAnimationEffect,
  presentationMediaCallCommand,
  expandGroupTargetSteps,
  resolveStepPlayStates,
} from "@mrnote/core/web/lib/presentation-anim-timeline.ts";
import {
  motionPathEndTranslate,
  motionPathKeyframeCss,
  motionPathKeyframeName,
} from "@mrnote/core/web/lib/presentation-motion-path.ts";
import { presentationBodyFontStyle, presentationHyperlinkStyle, resolveThemeAccentColors, type DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import { officeMasterStatesBackground } from "../../../../lib/presentation-office-master";
import { officeLayoutHidesBackgroundGraphics } from "../../../../lib/presentation-office-master-structure";
import {
  mergeMasterTheme,
  resolveSlideMaster,
  resolveSlideNativeLayout,
  resolveSlideContext,
  type SlideMaster,
  presentationSlideChartBodyFont,
} from "@mrnote/core/web/lib/presentation-master.ts";
import { presentationSlideRenderBlocks } from "../../../../lib/presentation/slide-render-blocks";
import { presentationDecorativeGroupIds } from "../../../../lib/presentation-a11y";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import { AUTOFIT_EMU_PER_PX } from "../../../../lib/presentation/text-layout-css";
import { PresentationSlideNumberContext, type LetterPlay } from "./PresentationRunsText";
import { presentationSmartArtCameraStyle } from "../../../../lib/presentation/selection-geometry";
import {
  MAX_PARAGRAPH_PLAY_ROWS,
  initialTimelineVisibility,
  timelineVisibleAfterStep,
  chartElementPlayKey,
  effectRecipeBoxOf,
  animationEffectOptionKeyframeBody,
  PRESENTATION_TIMELINE_EFFECT_KEYFRAMES_CSS,
  settledEmphasisFrame,
  timelineAnimationKeyframeName,
  effectCssTiming,
  playTimingFunction,
  resolveEffectDimColor,
  PRESENTATION_AFTER_HIDE_KEYFRAME,
  PRESENTATION_AFTER_HIDE_KEYFRAME_CSS,
  type BlockPlayState,
  type RecipeColorLayer,
} from "../../../../lib/presentation/block-play";
import { PresentationBlockView } from "./PresentationBlockView";
import { smartArtGraphicPlateMemberId } from "../../../../lib/presentation/smartart-graphic-plate";
import { PresentationChartThemeAccentsContext, PresentationChartThemeFontContext } from "./PresentationChartCanvas";
import { chartThemeAccents } from "@mrnote/core/web/lib/office-charts/chart-color-palettes.ts";
import { presentationSlideInk } from "../../../../lib/presentation/slide-ink";
import { captureTransitionLeadMs } from "../../../../lib/presentation-export-video/capture-timing";
import { getApiHttpBaseUrl } from "@mrnote/core/web/lib/env.ts";
import { inlineEffectSoundUrl } from "../../../../lib/presentation-package-sounds";
import { PresentationPageIdContext } from "./PresentationMediaContent";

/** One media call of the steps, due in the playing group. */
interface SlideMediaCall {
  readonly key: string;
  readonly blockId: string;
  readonly command: string;
  readonly delayMs: number;
}

/** The clip of a block on the slide (not a morph's copy of it). */
function slideMediaElement(root: ParentNode, blockId: string): HTMLMediaElement | null {
  for (const element of Array.from(
    root.querySelectorAll<HTMLElement>(`[data-presentation-block-id="${CSS.escape(blockId)}"]`),
  )) {
    if (element.closest(".presentation-present__morph")) continue;
    const media = element.querySelector<HTMLMediaElement>("video, audio");
    if (media) return media;
  }
  return null;
}

export function PresentationSlideView({
  slide,
  transitionClassName,
  theme,
  masters,
  revealedGroups,
  revealedSettled = false,
  firedTriggers,
  triggerReplays,
  onFireTrigger,
  slideIds,
  onNavigateToSlide,
  onClickAction,
  contentHidden = false,
  overlay,
  staticMedia = false,
  testId = "presentation-present-slide",
  naturalSize = false,
  fitToParent = false,
  showAnimations = true,
  slideNumber,
  entranceLeadMs,
  captureFrameMs,
  patternBitCssPx = 1,
}: {
  slide: SlideModel;
  transitionClassName?: string | null;
  /**
   * An entrance drawn over the slide from outside its own class (a transition
   * drawn in 3-D): how long it runs. The builds the slide starts by itself
   * wait for it as they wait for a CSS transition.
   */
  entranceLeadMs?: number;
  /**
   * Recorded frame by frame (Create a Video), at this frame length: the
   * builds wait for the transition as PowerPoint's recording has them wait
   * -- the transition drawn on whole frames, its last at its end, and the
   * slide's timeline starting on the frame after (`captureTransitionLeadMs`) --
   * and on the recording's clock, not the page's.
   */
  captureFrameMs?: number;
  /** The number this slide carries in its deck (a native field shows it, PPT-B367). */
  slideNumber?: number;
  /** Deck-level theme supplying default background / title colour / font. */
  theme?: DeckTheme;
  /** Deck-level masters the slide may inherit layout + style overrides from. */
  masters?: readonly SlideMaster[];
  /**
   * How many animation-timeline click-groups are revealed (1 = leading group).
   * Undefined → no scripted timeline applied (every block shown, as before).
   */
  revealedGroups?: number;
  /**
   * The revealed groups are an end state returned to (the show stepped back
   * onto this slide): shown as played, none replaying.
   */
  revealedSettled?: boolean;
  /**
   * Interactive trigger block ids the audience has clicked (see
   * {@link PresentationPresentOverlay}). A triggered step is revealed only when
   * its `triggerBlockId` is in this set. Empty/undefined for slides without
   * triggers → unchanged.
   */
  firedTriggers?: ReadonlySet<string>;
  /** How many times each fired trigger was clicked again to play its effects again. */
  triggerReplays?: ReadonlyMap<string, number>;
  /**
   * Fire a trigger (a present-mode click of a block that a triggered step starts
   * "on click of"). Absent → trigger blocks are inert (presenter-view / preview).
   */
  onFireTrigger?: (blockId: string) => void;
  /** Deck slide ids, for validating an internal `slide://` block link. */
  slideIds?: ReadonlySet<string>;
  /** Jump to a slide by id (internal `slide://` link click). */
  onNavigateToSlide?: (slideId: string) => void;
  onClickAction?: (action: PresentationClickAction) => void;
  /**
   * MORPH mode: while a morph layer is animating into THIS slide, its title +
   * blocks are suppressed (the morph layer paints the moving/fading content on
   * top) so the destination content does not flash at its final position beneath
   * the tween. The slide frame + background still render so the morph plays over
   * the correct backdrop. Default false → the slide renders its content as usual.
   */
  contentHidden?: boolean;
  /**
   * Optional overlay rendered INSIDE the slide box (which is `position: relative`)
   * so an absolutely-positioned child shares the slide's bounds — used to mount
   * the morph layer so its `%`-based block geometry maps to the same rect as the
   * static blocks. Absent → nothing extra is rendered (byte-for-byte as before).
   */
  overlay?: ReactNode;
  /**
   * Thumbnail mode: embed blocks render as a static badge instead of a live
   * iframe / `<video>` / `<audio>` so a rail of thumbnails costs no network or
   * playback surface. Default false → present mode renders media as before.
   */
  staticMedia?: boolean;
  /** The frame's test id: the slide left under a transition is not the slide on show. */
  testId?: string;
  /** Thumbnail owns the only scale; do not constrain this natural-size frame. */
  naturalSize?: boolean;
  /** Fit the complete slide frame to its host, not only the inner content. */
  fitToParent?: boolean;
  /** False projects final object states without playing object animations. */
  showAnimations?: boolean;
  /**
   * A pattern fill's bit, in CSS pixels on screen (lib/office-pattern-anchor):
   * 1 -- one screen point at any zoom, PowerPoint's window (the show, the
   * thumbnails); 4/3 -- one point of the page, PowerPoint's print.
   */
  patternBitCssPx?: number;
}) {
  const fontAliases = useContext(PresentationFontAliasesContext);
  const bounds = slideBounds(slide);
  const usesCanvas = slideDrawnAsSlide(slide as unknown as Parameters<typeof slideDrawnAsSlide>[0]);
  
  const decorativeGroups = useMemo(() => presentationDecorativeGroupIds(slide.blocks), [slide.blocks]);
  const widthEmu = slideDimension(slide, "widthEmu");
  const heightEmu = slideDimension(slide, "heightEmu");
  // Keep text, tables, shapes and animation coordinates in the same design
  // space as the editor. Resizing a preview changes one projection scale,
  // never the text frame's wrapping width or the document's authored font size.
  const projectionFrameRef = useRef<HTMLDivElement>(null);
  // Pattern fills on the slide's grid, one bit `patternBitCssPx` CSS pixels.
  useOfficePatternAnchor(projectionFrameRef, slide.id, patternBitCssPx);
  // Animations no reader recognised, played as the slide's timing tree states
  // them (`presentation-native-timing-player`): each click's run as the show
  // reveals it, entrances hidden until theirs.
  const timed = showAnimations && revealedGroups !== undefined;
  const nativeTiming = useMemo(() => (timed ? slideNativeTimingTree(slide) : null), [timed, slide]);
  const nativePlayedRef = useRef<{ played: number; animations: Animation[][] }>({ played: 0, animations: [] });
  // An effect's sound plays from the page's own package
  // (`presentation-native-media/snd-<digest>`).
  const nativePageId = useContext(PresentationPageIdContext);
  const nativeStage = useMemo(
    () => ({
      // A sound carried inline (a slide taken from another deck) plays as
      // it is; one the package holds, from the page's package.
      soundUrl: (digest: string) =>
        inlineEffectSoundUrl(slide.nativeTimingTree, digest) ??
        (nativePageId && /^[0-9a-f]{64}$/.test(digest)
          ? `${getApiHttpBaseUrl()}/api/v1/pages/${encodeURIComponent(nativePageId)}/presentation-native-media/snd-${digest}`
          : null),
      width: bounds.width / AUTOFIT_EMU_PER_PX,
      height: bounds.height / AUTOFIT_EMU_PER_PX,
      frames: new Map(
        slide.blocks.map((block) => [
          block.id,
          {
            left: (geometryNumber(block, "left") ?? 0) / AUTOFIT_EMU_PER_PX,
            top: (geometryNumber(block, "top") ?? 0) / AUTOFIT_EMU_PER_PX,
            width: (geometryNumber(block, "width") ?? 0) / AUTOFIT_EMU_PER_PX,
            height: (geometryNumber(block, "height") ?? 0) / AUTOFIT_EMU_PER_PX,
          },
        ]),
      ),
    }),
    [bounds.width, bounds.height, slide.blocks, slide.nativeTimingTree, nativePageId],
  );
  // The slide's own entrance transition, as the browser times it (the class's
  // CSS duration or the slide's explicit one). Builds that start on their own
  // wait for it to finish, as PowerPoint plays the transition first and the
  // slide's first automatic animation after it (PPT-B037).
  const [transitionLeadMs, setTransitionLeadMs] = useState(0);
  const transitionEndsAtRef = useRef(0);
  /** On a recording's clock: the lead, and the builds the slide entered with. */
  const transitionCaptureLeadRef = useRef<{ lead: number; groups: number | undefined }>({ lead: 0, groups: undefined });
  /**
   * What is left of the entrance for builds revealed at `groups`: on a
   * recording's clock, the whole of it for the builds the slide entered with
   * (each frame seeks every animation from its own start) and none for a
   * later click's.
   */
  const transitionLeftMs = useCallback(
    (groups: number | undefined) => {
      const captured = transitionCaptureLeadRef.current;
      if (captureFrameMs !== undefined) return captured.groups === groups ? captured.lead : 0;
      return Math.max(0, transitionEndsAtRef.current - performance.now());
    },
    [captureFrameMs],
  );
  useLayoutEffect(() => {
    const frame = projectionFrameRef.current;
    const outside = Number.isFinite(entranceLeadMs) && (entranceLeadMs ?? 0) > 0 ? entranceLeadMs! : 0;
    const settle = (lead: number) => {
      const timed = captureFrameMs !== undefined ? captureTransitionLeadMs(lead, captureFrameMs) : lead;
      // A recording seeks every animation to the frame's time from its own
      // start: the builds wait for the whole lead, not what the page's clock
      // says is left of it.
      transitionEndsAtRef.current = timed > 0 ? performance.now() + timed : 0;
      transitionCaptureLeadRef.current = { lead: captureFrameMs !== undefined ? timed : 0, groups: revealedGroups };
      setTransitionLeadMs(timed);
    };
    if (!frame || !transitionClassName || typeof getComputedStyle !== "function") {
      settle(outside);
      return;
    }
    const style = getComputedStyle(frame);
    const times = (value: string) =>
      value
        .split(",")
        .map((part) => part.trim())
        .map((part) =>
          part.endsWith("ms") ? Number.parseFloat(part) : Number.parseFloat(part) * 1000,
        )
        .filter((time) => Number.isFinite(time));
    const durations = times(style.animationDuration);
    const delays = times(style.animationDelay);
    const lead = durations.length
      ? Math.max(
          0,
          ...durations.map((duration, index) => duration + (delays[index] ?? delays[0] ?? 0)),
        )
      : slide.transitionDurationMs !== undefined
        ? clampTransitionDuration(slide.transitionDurationMs)
        : 0;
    settle(Math.max(lead, outside));
    // The builds revealed as the slide enters are read then, not followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionClassName, slide.id, slide.transitionDurationMs, entranceLeadMs, captureFrameMs]);
  useLayoutEffect(() => {
    const root = projectionFrameRef.current;
    // While a Morph covers the slide its objects are not drawn: the runs play
    // once they are (after the Morph, as PowerPoint plays them).
    if (!root || !nativeTiming || revealedGroups === undefined || contentHidden) return;
    const state = nativePlayedRef.current;
    const target = Math.max(0, Math.min(revealedGroups, nativeTiming.clicks.length));
    const stage = nativeStage;
    if (target < state.played) {
      // Back: the runs past the step are undone.
      for (const runs of state.animations.splice(target)) for (const animation of runs) animation.cancel();
      state.played = target;
      applyNativeTimingVisibility(root, nativeTiming, target);
      return;
    }
    // A click while a run still plays first seeks it to its end, as the main
    // sequence's `nextAc="seek"` states (ECMA-376 19.5.65): the next run never
    // plays over the one before it. What repeats Until Next Click stops where
    // it is; what repeats until the end of the slide cannot end and plays on.
    if (target > state.played) {
      for (const runs of state.animations.slice(0, state.played)) endNativeTimingRun(runs ?? [], false);
    }
    // A run the slide starts with waits for the rest of its transition
    // (set by the effect above, in this same commit), as the step-played
    // builds do; a later click's run finds it over.
    const lead = state.played === 0 ? transitionLeftMs(revealedGroups) : 0;
    for (let index = state.played; index < target; index += 1) {
      const animations = playNativeTimingClick(root, nativeTiming, index, stage, lead);
      // Runs stepped past, or a step returned to already played, land at their end.
      if (index < target - 1 || revealedSettled) endNativeTimingRun(animations, true);
      state.animations[index] = animations;
    }
    state.played = target;
    // The run now playing keeps its entrances hidden until its own `set`.
    applyNativeTimingVisibility(root, nativeTiming, revealedSettled ? target : Math.max(0, target - 1));
  }, [nativeTiming, revealedGroups, revealedSettled, nativeStage, transitionLeftMs, contentHidden]);
  // "Trigger: On Click of" from the tree: each click on the object (the
  // show's fired-trigger set and replay counts) plays its next run; a click
  // while one plays brings that one to its end first.
  const nativeTriggerPlayedRef = useRef(new Map<string, { count: number; animations: Animation[] }>());
  useLayoutEffect(() => {
    const root = projectionFrameRef.current;
    if (!root || !nativeTiming?.triggers?.length) return;
    const played = nativeTriggerPlayedRef.current;
    for (const block of nativeTimingTriggerBlocks(nativeTiming)) {
      const count = (firedTriggers?.has(block) ? 1 : 0) + (triggerReplays?.get(block) ?? 0);
      const state = played.get(block) ?? { count: 0, animations: [] };
      if (count < state.count) {
        for (const animation of state.animations) animation.cancel();
        state.count = 0;
        state.animations = [];
      }
      for (let click = state.count + 1; click <= count; click += 1) {
        endNativeTimingRun(state.animations, false);
        state.animations = nativeTimingTriggerRuns(nativeTiming, block, click).flatMap((run) =>
          playNativeTimingRun(root, run, nativeStage),
        );
      }
      state.count = count;
      played.set(block, state);
    }
  }, [nativeTiming, firedTriggers, triggerReplays, nativeStage]);
  const designWidth = Math.max(1, bounds.width / AUTOFIT_EMU_PER_PX);
  const designHeight = Math.max(1, bounds.height / AUTOFIT_EMU_PER_PX);
  const [projectionScale, setProjectionScale] = useState(1);
  useLayoutEffect(() => {
    if (naturalSize) return;
    const frame = projectionFrameRef.current;
    if (!frame) return;
    const host = fitToParent ? frame.parentElement : frame;
    if (!host) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      // client dimensions exclude any outer workspace/thumbnail transform;
      // using the screen-space rectangle here would apply that scale twice.
      const hostStyle = fitToParent ? getComputedStyle(host) : null;
      const inset = (value: string | undefined) =>
        Number.parseFloat(value ?? "0") || 0;
      const width =
        host.clientWidth - inset(hostStyle?.paddingLeft) - inset(hostStyle?.paddingRight);
      const height =
        host.clientHeight - inset(hostStyle?.paddingTop) - inset(hostStyle?.paddingBottom);
      const scale = Math.min(width / designWidth, height / designHeight);
      if (!Number.isFinite(scale) || scale <= 0) return;
      setProjectionScale((current) =>
        Math.abs(current - scale) < 0.000001 ? current : scale,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(host);
    if (!observer) window.addEventListener("resize", measure);
    return () => {
      disposed = true;
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", measure);
    };
  }, [designHeight, designWidth, fitToParent, naturalSize]);
  // A chart on this slide paints its theme colours and draws its unnamed
  // face from the slide's own master's theme, as PowerPoint does -- wherever
  // the slide is mounted. Print and Export > PDF had no provider at all and
  
  // p3: orange for the deck's red accent 2).
  const slideTheme = useMemo(() => mergeMasterTheme(theme, resolveSlideMaster(slide, masters)), [theme, slide, masters]);
  const slideChartAccents = useMemo(() => chartThemeAccents(resolveThemeAccentColors(slideTheme)), [slideTheme]);
  // The face of the slide's own master's theme (`presentationSlideChartBodyFont`).
  const slideChartFont = presentationSlideChartBodyFont(slideTheme, resolveSlideMaster(slide, masters));
  // Resolve the full slide context under master inheritance: background + title
  // style draw from the slide override > master override > deck theme > default
  // chain. A master-less, theme-less slide yields the same result as before
  // (absent background, empty title style).
  const slideContext = resolveSlideContext(slide, masters, theme);
  const background = slideContext.background;
  const defaultAnimationFillColor =
    normalizeOfficeHexColor(resolveThemeAccentColors(theme)[1]) ?? "#ed7d31";
  // Optional RICH background fill (gradient / picture / pattern) on the slide or
  // the deck theme, which OVERRIDES the solid colour. When the resolver returns a
  // rich (non-solid) fill we render it via the `background` shorthand; otherwise
  // we keep the master-aware solid `backgroundColor` resolution below byte-for-
  // byte (the rich resolver is unaware of master inheritance, so the existing
  // `slideContext.background` stays authoritative for the solid case).
  const richBackground = resolveSlideBackgroundFill(
    slide,
    theme,
    isDrawableImageSource,
  );
  const richBackgroundCss =
    richBackground.kind !== "none" &&
    (!richBackground.isSolid ||
      normalizeSolidBackgroundTransparency(slide.backgroundTransparency) > 0)
      ? slideBackgroundCss(richBackground)
      : null;
  // A per-slide transition duration drives an inline `animation-duration`
  // override ONLY while a transition class is active (so it has a keyframe to
  // time). A slide with no explicit duration leaves the CSS default untouched →
  // byte-for-byte unchanged for every existing deck.
  const transitionDurationMs =
    slide.transitionDurationMs !== undefined
      ? clampTransitionDuration(slide.transitionDurationMs)
      : undefined;
  const style: CSSProperties = {
    ...(widthEmu && heightEmu
      ? { aspectRatio: `${widthEmu} / ${heightEmu}` }
      : {}),
    ...(richBackgroundCss
      ? richBackgroundCss
      : background
        ? { backgroundColor: background }
        : {}),
    ...(transitionClassName && transitionDurationMs !== undefined
      ? { animationDuration: `${transitionDurationMs}ms` }
      : {}),
    // The slide's hyperlink colour (its master's theme over the deck's).
    ...(presentationHyperlinkStyle(
      mergeMasterTheme(theme, resolveSlideMaster(slide, masters)),
      resolveSlideMaster(slide, masters)?.linkColors,
    ) as CSSProperties),
    // ... and its body font, which a table cell naming no face draws in.
    ...(presentationServedBodyFontStyle(presentationBodyFontStyle(
      mergeMasterTheme(theme, resolveSlideMaster(slide, masters)),
    )) as CSSProperties),
  };
  const className = [
    "presentation-present__slide",
    usesCanvas ? "presentation-present__slide--canvas" : null,
    transitionClassName || null,
  ]
    .filter(Boolean)
    .join(" ");
  const prismTransition = transitionClassName?.match(/--enter-(cube|box|rotate|orbit)-/i)?.[1];
  const titleStyle = slideContext.titleStyle;
  // Resolve the per-block animation-timeline play state for the current revealed
  // group count. Only active when this slide carries a scripted sequence AND a
  // group count was supplied (present mode). A block referenced by multiple steps
  // is VISIBLE if any of its steps is visible, and ANIMATES via the step that is
  // currently animating (with its cumulative delay/duration). Blocks not on the
  // timeline at all are always shown (their `block.animation` enter fx still
  // play). A slide with no timeline (the overwhelming common case) skips this
  // entirely so present mode is byte-for-byte unchanged.
  // The set of block ids that are interactive TRIGGERS on this slide (named by a
  // step's `triggerBlockId`). A block in this set fires its triggered step(s)
  // when clicked in present mode. Empty for the common case (no triggered steps).
  const triggerBlockIds = useMemo<ReadonlySet<string>>(() => {
    const sequence = slide.animationSequence ?? [];
    const ids = new Set<string>();
    for (const step of sequence) {
      if (typeof step.triggerBlockId === "string" && step.triggerBlockId) {
        ids.add(step.triggerBlockId);
      }
    }
    for (const block of nativeTimingTriggerBlocks(nativeTiming)) ids.add(block);
    return ids;
  }, [slide.animationSequence, nativeTiming]);
  // Picture Format > Animate as Background (PPT-A134): in the show, the
  // picture zooms and pans between its points, over and over.
  const animatedBackground = useMemo(
    () =>
      showAnimations && !staticMedia
        ? presentationAnimatedBackgroundPlay(slide.blocks, bounds, (block) => effectRecipeBoxOf(block, bounds))
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the slide's size, not the object
    [showAnimations, staticMedia, slide.blocks, bounds.width, bounds.height],
  );
  const { blockPlay, motionPathCss, mediaCalls } = useMemo<{
    blockPlay: Map<string, BlockPlayState>;
    motionPathCss: string;
    /** The media calls (Play / Pause on a clip) starting in the playing group. */
    mediaCalls: readonly SlideMediaCall[];
  }>(() => {
    const map = new Map<string, BlockPlayState>();
    const mediaCalls: SlideMediaCall[] = [];
    // A step on a whole group plays on every member (row 1074).
    const sequence = expandGroupTargetSteps(slide.animationSequence ?? [], slide.blocks);
    // A slide drawn still at a settled step (the slide a transition is leaving)
    // keeps what its build has brought in or taken away, with nothing playing.
    if (
      (!showAnimations && !revealedSettled) ||
      revealedGroups === undefined ||
      sequence.length === 0
    ) {
      return { blockPlay: map, motionPathCss: "", mediaCalls };
    }
    const states = resolveStepPlayStates(
      sequence,
      revealedGroups,
      firedTriggers,
      revealedSettled,
      // An effect over a block's letters plays past its own duration; the
      
      (step) => effectPlayDurationMs(step, slide.blocks.find((block) => block.id === step.blockId)),
      // Each click on a trigger plays its next group (PowerPoint's
      // interactive sequence).
      firedTriggers
        ? new Map([...firedTriggers].map((id) => [id, 1 + (triggerReplays?.get(id) ?? 0)]))
        : undefined,
    );
    // Which play group each step belongs to, so a block's play identity can name
    // the latest revealed group (or fired trigger) that started one of its
    // occurrences. Mirrors the partition resolveStepPlayStates works from.
    const partition = partitionTimelineSteps(sequence);
    const revealedAutoGroups = Math.max(
      0,
      Math.min(revealedGroups, partition.autoGroups.length),
    );
    const latestGroupByBlock = new Map<string, number>();
    const firedTriggersByBlock = new Map<string, Set<string>>();
    for (let g = 0; g < revealedAutoGroups; g += 1) {
      for (const step of partition.autoGroups[g].steps) {
        if (step.animation === "none" && step.motionPath === undefined) continue;
        latestGroupByBlock.set(step.blockId, g + 1);
      }
    }
    for (const group of partition.triggerGroups) {
      if (!firedTriggers?.has(group.triggerBlockId)) continue;
      for (const step of group.steps) {
        if (step.animation === "none" && step.motionPath === undefined) continue;
        const fired = firedTriggersByBlock.get(step.blockId) ?? new Set<string>();
        fired.add(group.triggerBlockId);
        firedTriggersByBlock.set(step.blockId, fired);
      }
    }
    const playKeyOf = (blockId: string): string | undefined => {
      const parts: string[] = [];
      const group = latestGroupByBlock.get(blockId);
      if (group !== undefined) parts.push(`g${group}`);
      const fired = firedTriggersByBlock.get(blockId);
      // A trigger clicked again after its effects finished plays them again:
      // the play identity changes and the block replays (whenNotActive).
      if (fired) parts.push(...[...fired].sort().map((id) => `t:${id}${triggerReplays?.get(id) ? `#${triggerReplays.get(id)}` : ""}`));
      return parts.length > 0 ? parts.join("|") : undefined;
    };
    // Motion-path keyframes are generated against the SLIDE'S EMU dimensions so a
    // `translate(N cqw, M cqh)` maps each EMU offset to the slide-relative
    // fraction. `bounds` always carries a positive width/height (explicit dims or
    // the default slide), so the conversion is well-defined.
    const motionWidthEmu = bounds.width;
    const motionHeightEmu = bounds.height;
    // (A chart's element steps leave the chart itself on stage.)
    const initialVisibilityByBlock = initialTimelineVisibility(
      sequence.filter((step) => step.chartElement === undefined || chartElementPlayKey(step.chartElement) === null),
    );
    // Dedupe injected keyframes by name (two steps with the same path + dims
    // share one rule). Only the CURRENTLY ANIMATING steps inject CSS.
    const keyframeByName = new Map<string, string>();
    // What is left of the slide's entrance transition: a build starting now
    // is held until it ends (0 once it has).
    const transitionRemainingMs = transitionLeadMs > 0 ? transitionLeftMs(revealedGroups) : 0;
    for (let i = 0; i < sequence.length; i += 1) {
      const step = sequence[i];
      const rawState = states.get(i);
      const state =
        rawState && rawState.animate && transitionRemainingMs > 0
          ? { ...rawState, delayMs: rawState.delayMs + transitionRemainingMs }
          : rawState;
      if (!state) continue;
      // A chart built element by element (row 1080): the background step
      // (gridlines and legend) brings the chart itself; each series,
      // category or point comes in (or goes) with its own step, drawn where
      // it stands. Without a background step the background is there from
      // the start.
      const chartKey = step.chartElement !== undefined ? chartElementPlayKey(step.chartElement) : null;
      if (chartKey !== null) {
        const existing = map.get(step.blockId);
        const elements = new Map(existing?.chartPlay ?? []);
        const elementCategory = presentationAnimationEffect(step.animation)?.category;
        const prior = elements.get(chartKey);
        elements.set(chartKey, {
          visible: timelineVisibleAfterStep(elementCategory, state, prior?.visible ?? elementCategory !== "entrance"),
          durationMs: state.animate ? state.durationMs : 0,
          delayMs: state.animate ? state.delayMs : 0,
        });
        map.set(step.blockId, {
          ...(existing ?? {
            timelineControlled: true,
            visible: initialVisibilityByBlock.get(step.blockId) ?? true,
            animate: false,
          }),
          chartPlay: elements,
          playKey: existing?.playKey ?? playKeyOf(step.blockId),
        });
        continue;
      }
      // A media call plays or pauses its clip at its start and changes
      // nothing about how the clip is drawn.
      const mediaCommand = presentationMediaCallCommand(step.animation);
      if (mediaCommand !== null) {
        if (state.animate) {
          mediaCalls.push({
            key: `${i}:${playKeyOf(step.blockId) ?? ""}:${revealedGroups}`,
            blockId: step.blockId,
            command: mediaCommand,
            delayMs: state.delayMs,
          });
        }
        continue;
      }
      // The animating step's motion path (if any) → a stable keyframe name + its
      // CSS, collected for one-time injection. A non-animating step contributes
      // nothing (its block keeps the most-recent animating step's keyframe).
      let motionKeyframe: string | undefined;
      let settledMotionTranslate: string | undefined;
      if (state.animate && step.animation === "transparency" && step.effectOption) {
        const name = timelineAnimationKeyframeName(step.animation, step.effectOption);
        const body = animationEffectOptionKeyframeBody(step.animation, step.effectOption);
        if (name && body) keyframeByName.set(name, `@keyframes ${name}{${body}}`);
      }
      // An effect drawn from a recipe: its keyframe is built for this block's
      // place on the slide and injected with the motion-path keyframes.
      let recipeKeyframe: string | undefined;
      let stepLetterPlay: LetterPlay | undefined;
      // Effect Options: how the occurrence's keyframe runs (Repeat,
      // Auto-reverse, Smooth start / end, Rewind), and when After animation
      // takes the object away within this click.
      let stepTiming = state.animate ? effectCssTiming(step) : undefined;
      let afterHideAtMs: number | undefined;
      const stepTarget = slide.blocks.find((candidate) => candidate.id === step.blockId);
      const stepHasText =
        stepTarget !== undefined &&
        (stepTarget.type === "text" || stepTarget.type === "shape") &&
        typeof (stepTarget as { text?: unknown }).text === "string" &&
        ((stepTarget as { text?: string }).text ?? "").trim().length > 0;
      // Animate text By word / By letter (Effect Options).
      const textUnitStepMs = effectTextUnitStepMs(step.effectSettings, state.durationMs);
      const textUnit =
        textUnitStepMs !== null && stepHasText && !step.paragraphs
          ? step.effectSettings?.textUnit
          : undefined;
      if (state.animate) {
        const settings = step.effectSettings;
        const baseRecipe = effectRecipe(step.animation, step.effectOption);
        // Smooth start / end changed on a recipe effect: its samples bake the
        // easing in, so they are drawn again with the chosen shares.
        const recipe =
          baseRecipe && settings && (settings.accel !== undefined || settings.decel !== undefined)
            ? {
                ...baseRecipe,
                ac: (settings.accel ?? Math.round((baseRecipe.ac ?? 0) * 100_000)) / 100_000,
                dc: (settings.decel ?? Math.round((baseRecipe.dc ?? 0) * 100_000)) / 100_000,
              }
            : baseRecipe;
        const recipeClass = effectRecipeClass(step.animation);
        if (recipe && recipeClass) {
          if (stepTiming?.timingFunction) {
            const { timingFunction: _baked, ...rest } = stepTiming;
            stepTiming = rest;
          }
          const blockBox = effectRecipeBoxOf(stepTarget, bounds);
          // An effect that iterates over text plays on each letter of a block
          // that has text; a letter is a small box at the block's place.
          const letterStepMs = effectRecipeLetterStepMs(recipe, state.durationMs);
          const letters = (letterStepMs !== null || textUnit !== undefined) && stepHasText && !step.paragraphs;
          const box = letters ? { ...blockBox, w: textUnit === "word" ? 0.08 : 0.02, h: 0.045 } : blockBox;
          const keyframe =
            effectRecipeKeyframeName(step.animation, step.effectOption, box) +
            (letters ? "-letter" : "") +
            (recipe !== baseRecipe
              ? `-s${Math.round((recipe.ac ?? 0) * 100_000)}-${Math.round((recipe.dc ?? 0) * 100_000)}`
              : "");
          if (!keyframeByName.has(keyframe)) {
            keyframeByName.set(
              keyframe,
              `@keyframes ${keyframe}{${effectRecipeKeyframeBody(recipe, recipeClass, box)}}`,
            );
          }
          if (letters) {
            stepLetterPlay = {
              keyframe,
              durationMs: state.durationMs,
              delayMs: state.delayMs,
              stepMs: textUnit !== undefined ? (textUnitStepMs ?? 0) : (letterStepMs ?? 0),
              hiddenUntilStart: recipeClass === "entr",
              ...(textUnit ? { unit: textUnit } : {}),
              ...(stepTiming ? { timing: stepTiming } : {}),
            };
          } else recipeKeyframe = keyframe;
        } else if (textUnit) {
          // A hand-drawn effect By word / By letter: each unit runs the
          // effect's own keyframe.
          const keyframe = timelineAnimationKeyframeName(step.animation, step.effectOption);
          if (keyframe) {
            stepLetterPlay = {
              keyframe,
              durationMs: state.durationMs,
              delayMs: state.delayMs,
              stepMs: textUnitStepMs ?? 0,
              hiddenUntilStart: presentationAnimationEffect(step.animation)?.category === "entrance",
              unit: textUnit,
              timingFunction: stepTiming?.timingFunction ?? playTimingFunction(undefined),
              ...(stepTiming ? { timing: stepTiming } : {}),
            };
          }
        }
        const category = presentationAnimationEffect(step.animation)?.category;
        if (
          settings &&
          (settings.afterEffect === "hide" || (settings.rewind && category === "entrance")) &&
          typeof settings.repeat !== "string"
        ) {
          afterHideAtMs = state.delayMs + effectPlayDurationMs(step, stepTarget);
          keyframeByName.set(PRESENTATION_AFTER_HIDE_KEYFRAME, PRESENTATION_AFTER_HIDE_KEYFRAME_CSS);
        }
      }
      // After animation: a colour, once a later click has come.
      const dimColor = state.dimmed
        ? resolveEffectDimColor(
            step.effectSettings?.dimColor,
            slideTheme?.colorSlots,
            resolveThemeAccentColors(slideTheme),
          )
        : undefined;
      // A recipe effect that changes the object TO a theme colour: the layers
      // that draw it while it plays, and what it leaves once held.
      const recipeForColor = effectRecipe(step.animation, step.effectOption);
      const recipeLayer = recipeForColor ? effectRecipeColorLayer(recipeForColor) : null;
      const recipeLayerColor = recipeLayer
        ? recipeLayer.scheme === "bg1"
          ? (normalizeOfficeHexColor(background) ?? "#ffffff")
          : defaultAnimationFillColor
        : undefined;
      let colorLayer: RecipeColorLayer | undefined;
      if (state.animate && recipeLayer && recipeLayerColor) {
        const keyframe = `mrai-ppt-rx-color-${step.animation}`;
        if (!keyframeByName.has(keyframe)) {
          keyframeByName.set(keyframe, `@keyframes ${keyframe}{${recipeLayer.keyframeBody}}`);
        }
        colorLayer = {
          color: recipeLayerColor,
          fill: recipeLayer.fill,
          line: recipeLayer.line,
          text: recipeLayer.text,
          keyframe,
        };
      }
      const recipeHeld =
        state.emphasisSettled && recipeForColor
          ? {
              style: effectRecipeSettledStyle(
                recipeForColor,
                "emph",
                effectRecipeBoxOf(
                  slide.blocks.find((candidate) => candidate.id === step.blockId),
                  bounds,
                ),
              ),
              color: recipeLayer?.holds ? recipeLayerColor : undefined,
            }
          : null;
      if (state.animate && state.motionPath) {
        const css = motionPathKeyframeCss(
          state.motionPath,
          motionWidthEmu,
          motionHeightEmu,
        );
        if (css) {
          motionKeyframe = motionPathKeyframeName(
            state.motionPath,
            motionWidthEmu,
            motionHeightEmu,
          );
          keyframeByName.set(motionKeyframe, css);
        }
      }
      if (state.motionPathSettled && state.motionPath) {
        settledMotionTranslate =
          motionPathEndTranslate(
            state.motionPath,
            motionWidthEmu,
            motionHeightEmu,
          ) ?? undefined;
      }
      const existing = map.get(step.blockId);
      const effectIdentity = presentationAnimationEffect(step.animation);
      if (step.paragraphs) {
        // An imported By Paragraph build: the step plays on its rows only.
        const rows = new Map(existing?.paragraphPlay ?? []);
        const rowCategory = effectIdentity?.category;
        const last = Math.min(
          step.paragraphs.end,
          step.paragraphs.start + MAX_PARAGRAPH_PLAY_ROWS - 1,
        );
        for (let row = step.paragraphs.start; row <= last; row += 1) {
          const prior = rows.get(row);
          const priorVisible = prior?.visible ?? rowCategory !== "entrance";
          const rowVisible = timelineVisibleAfterStep(rowCategory, state, priorVisible);
          rows.set(
            row,
            state.animate
              ? {
                  visible: rowVisible,
                  animate: true,
                  animation: step.animation,
                  recipeKeyframe,
                  effectOption: step.effectOption,
                  delayMs: state.delayMs,
                  durationMs: state.durationMs,
                }
              : { ...(prior ?? { animate: false }), visible: rowVisible },
          );
        }
        map.set(step.blockId, {
          // The block is on stage unless a step of its own (the attached
          // shape's entrance) brings it in.
          ...(existing ?? {
            timelineControlled: true,
            visible: initialVisibilityByBlock.get(step.blockId) ?? true,
            animate: false,
          }),
          paragraphPlay: rows,
          playKey: existing?.playKey ?? playKeyOf(step.blockId),
        });
        continue;
      }
      const colorTarget =
        effectIdentity?.nativeBehavior === "color"
          ? (step.effectColor ?? defaultAnimationFillColor)
          : undefined;
      const category = effectIdentity?.category;
      const playKey = existing?.playKey ?? playKeyOf(step.blockId);
      const effects = state.animate
        ? [
            ...(existing?.effects ?? []),
            {
              animation: step.animation,
              effectOption: step.effectOption,
              delayMs: state.delayMs,
              durationMs: state.durationMs,
              motionKeyframe,
              recipeKeyframe,
              ...(colorTarget ? { effectColor: colorTarget } : {}),
              ...(colorLayer ? { colorLayer } : {}),
              ...(stepTiming ? { timing: stepTiming } : {}),
              ...(stepLetterPlay ? { letters: true as const } : {}),
            },
          ]
        : existing?.effects;
      const priorVisible =
        existing?.visible ?? initialVisibilityByBlock.get(step.blockId) ?? true;
      const visible = timelineVisibleAfterStep(category, state, priorVisible);
      map.set(step.blockId, {
        // The first entrance starts hidden; emphasis/exit start on-stage. Once
        // an exit settles, it remains hidden across later group remounts until
        // a subsequent entrance explicitly reveals it again.
        timelineControlled: true,
        visible,
        animate: existing?.animate || state.animate,
        animation: state.animate ? step.animation : existing?.animation,
        recipeKeyframe: state.animate ? recipeKeyframe : existing?.recipeKeyframe,
        letterPlay: stepLetterPlay ?? existing?.letterPlay,
        timing: state.animate ? stepTiming : existing?.timing,
        afterHideAtMs: afterHideAtMs ?? (state.animate ? undefined : existing?.afterHideAtMs),
        effectOption: state.animate
          ? step.effectOption
          : existing?.effectOption,
        effectColor:
          state.animate && colorTarget
            ? colorTarget
            : existing?.effectColor,
        settledFillColor:
          dimColor && !stepHasText
            ? dimColor
            : recipeHeld?.color && recipeLayer?.fill
            ? recipeHeld.color
            : state.colorEffectSettled &&
                colorTarget &&
                effectIdentity?.nativeColorAttribute === "fillcolor"
              ? colorTarget
              : existing?.settledFillColor,
        settledStrokeColor:
          recipeHeld?.color && recipeLayer?.line
            ? recipeHeld.color
            : state.colorEffectSettled &&
                colorTarget &&
                effectIdentity?.nativeColorAttribute === "stroke.color"
              ? colorTarget
              : existing?.settledStrokeColor,
        settledTextColor:
          dimColor && stepHasText
            ? dimColor
            : recipeHeld?.color && recipeLayer?.text
            ? recipeHeld.color
            : state.colorEffectSettled &&
                colorTarget &&
                effectIdentity?.nativeColorAttribute === "style.color"
              ? colorTarget
              : existing?.settledTextColor,
        settledRecipeStyle: (() => {
          const { transform: _heldTransform, ...held } = recipeHeld?.style ?? {};
          return Object.keys(held).length > 0
            ? { ...existing?.settledRecipeStyle, ...(held as CSSProperties) }
            : existing?.settledRecipeStyle;
        })(),
        // Completed emphasis end states accumulate in sequence order (a second
        // Grow grows the already grown object).
        ...(() => {
          const settled = state.emphasisSettled
            ? settledEmphasisFrame(step.animation, step.effectOption)
            : null;
          return {
            settledTransform:
              [existing?.settledTransform, settled?.transform, recipeHeld?.style?.transform]
                .filter(Boolean)
                .join(" ") || undefined,
            settledOpacity: settled?.opacity ?? existing?.settledOpacity,
          };
        })(),
        delayMs: state.animate ? state.delayMs : existing?.delayMs,
        durationMs: state.animate ? state.durationMs : existing?.durationMs,
        motionKeyframe: state.animate
          ? motionKeyframe
          : existing?.motionKeyframe,
        settledMotionTranslate: state.motionPathSettled
          ? settledMotionTranslate
          : state.animate && state.motionPath
            ? undefined
            : existing?.settledMotionTranslate,
        effects,
        playKey,
        paragraphPlay: existing?.paragraphPlay,
        chartPlay: existing?.chartPlay,
      });
    }
    // The theme colours a recipe may name (Color Typewriter, Brush Color).
    if (keyframeByName.size > 0) {
      keyframeByName.set(
        "mrai-ppt-fx-scheme",
        `[data-testid="presentation-projection-surface"]{--mrai-ppt-fx-accent2:${defaultAnimationFillColor}}`,
      );
    }
    return {
      blockPlay: map,
      motionPathCss: [...keyframeByName.values()].join("\n"),
      mediaCalls,
    };
  }, [
    revealedGroups,
    revealedSettled,
    transitionLeadMs,
    transitionLeftMs,
    firedTriggers,
    triggerReplays,
    showAnimations,
    slide.animationSequence,
    slide.blocks,
    bounds.width,
    bounds.height,
    defaultAnimationFillColor,
    slideTheme,
    background,
  ]);
  // Media calls of the steps (Play / Pause on a clip): each call once, at its
  // start in the group that plays it; one not yet due when the group changes
  // is dropped with it.
  const mediaCallsIssuedRef = useRef(new Set<string>());
  const mediaCallsKey = mediaCalls.map((call) => call.key).join("|");
  useEffect(() => {
    const root = projectionFrameRef.current;
    if (!root || mediaCalls.length === 0) return;
    const issued = mediaCallsIssuedRef.current;
    const pending = new Map<string, number>();
    for (const call of mediaCalls) {
      if (issued.has(call.key)) continue;
      issued.add(call.key);
      pending.set(
        call.key,
        window.setTimeout(() => {
          pending.delete(call.key);
          const media = slideMediaElement(root, call.blockId);
          if (media) runNativeMediaCommand(media, call.command);
        }, Math.max(0, call.delayMs)),
      );
    }
    return () => {
      for (const [key, timer] of pending) {
        window.clearTimeout(timer);
        issued.delete(key);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the calls
  }, [mediaCallsKey]);
  return (
    <PresentationChartThemeAccentsContext.Provider value={slideChartAccents}>
    <PresentationChartThemeFontContext.Provider value={slideChartFont}>
    <PresentationSlideNumberContext.Provider value={slideNumber}>
    <div
      ref={projectionFrameRef}
      // The slide keeps its ltr geometry under an rtl interface.
      dir="ltr"
      className={className}
      style={{ ...style, display: "block", padding: 0,
        // Words that state no colour draw in the slide's own ink, as on the
        // canvas, wherever this slide is mounted (show, thumbnails, Reading
        // View, the presenter's slides).
        color: presentationSlideInk(theme, resolveSlideMaster(slide, masters)),
        ...(prismTransition ? { "--ppt-prism-duration": `${transitionDurationMs ?? BASIC_TRANSITION_DURATION_MS}ms` } as CSSProperties : {}),
        // A picture of the slide (Export > Image, print, thumbnails) is the
        // page alone: the show's rounded corner and drop shadow left grey
        
        ...(naturalSize ? { width: designWidth, height: designHeight, maxWidth: "none", maxHeight: "none", borderRadius: 0, boxShadow: "none" } : {}),
        ...(fitToParent && !naturalSize ? {
          width: designWidth * projectionScale,
          height: designHeight * projectionScale,
          maxWidth: "none",
          maxHeight: "none",
          flex: "0 0 auto",
          borderRadius: 0,
        } : {}),
      }}
      data-testid={testId}
      data-prism-transition={prismTransition}
      data-transition={normalizeSlideTransition(slide.transition)}
      data-content-hidden={contentHidden ? "true" : "false"}
    >
      <div
        data-testid="presentation-projection-surface"
        data-projection-scale={naturalSize ? 1 : projectionScale}
        style={{
          alignContent: "start",
          boxSizing: "border-box",
          containerType: usesCanvas ? "size" : undefined,
          display: usesCanvas ? "block" : "grid",
          gap: usesCanvas ? undefined : 18,
          height: designHeight,
          left: "50%",
          padding: usesCanvas ? 0 : "54px 64px",
          position: "absolute",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${naturalSize ? 1 : projectionScale})`,
          transformOrigin: "center center",
          width: designWidth,
        }}
      >
      {deckDrawsOfficeThemeArtwork(theme) ? (
        <PresentationOfficeThemeArtwork
          theme={theme}
          layoutId={
            resolveSlideNativeLayout(slide, masters ?? [])?.builtInLayoutId ??
            slide.layout
          }
          includeGround={
            richBackground.kind === "none" &&
            !slide.backgroundColor &&
            !officeMasterStatesBackground(theme)
          }
          includeGraphics={
            !slide.hideBackgroundGraphics &&
            // Hide Background Graphics on the slide's layout (PPT-B030).
            !officeLayoutHidesBackgroundGraphics(theme, slide.layout)
          }
          style={{ zIndex: -1 }}
        />
      ) : null}
      {/* Motion-path keyframes for the currently-animating timeline steps on this
          slide. Generated deterministically from each path + the slide's EMU dims
          (no Date / no random), deduped by name, and injected once. The
          `translate(N cqw, M cqh)` units resolve against the slide's size query
          container (container-type: size on the canvas slide). Empty string when
          no motion path is playing → nothing rendered. */}
      {motionPathCss ? (
        <style data-testid="presentation-motion-path-css">
          {motionPathCss}
        </style>
      ) : null}
      {animatedBackground ? (
        <style data-testid="presentation-animated-background-css">{animatedBackground.css}</style>
      ) : null}
      {showAnimations && slide.animationSequence?.some((step) =>
        isPresentationAnimationEffectId(step.animation),
      ) ? (
        <style data-testid="presentation-animation-effect-css">
          {PRESENTATION_TIMELINE_EFFECT_KEYFRAMES_CSS}
        </style>
      ) : null}
      {/* While a morph tweens INTO this slide, suppress its own title + blocks so
          the destination content doesn't flash at its settled position beneath the
          morph layer. The background/frame above still render under the morph. */}
      {!contentHidden && !usesCanvas && slide.title ? (
        <h2
          className="presentation-present__slide-title"
          style={{
            color: titleStyle.color ?? undefined,
            fontFamily: presentationFontFamilyWithAssets(titleStyle.fontFamily ?? undefined, fontAliases),
            // Slide-master TITLE text style: a theme/master-supplied default
            // size / weight. Absent (no theme contribution) leaves the built-in
            // title styling untouched, so themeless decks are byte-for-byte same.
            fontSize: titleStyle.fontSize ?? undefined,
            fontWeight: titleStyle.bold ? 700 : undefined,
          }}
        >
          {slide.title}
        </h2>
      ) : null}
      {!contentHidden
        ? presentationSlideRenderBlocks(slide, masters, theme).map(({ block, index: blockIndex }) => (
              <PresentationBlockView
                // The play identity is part of the key so a block whose own
                // animation starts again (a second, identical effect on a later
                // click) remounts and replays on its own; the slide and every
                // other block (and their media) stay mounted.
                key={`${block.id}:${blockIndex}${
                  blockPlay.get(block.id)?.playKey
                    ? `:${blockPlay.get(block.id)?.playKey}`
                    : ""
                }`}
                block={block}
                bounds={bounds}
                theme={theme}
                slide={slide}
                masters={masters}
                play={
                  animatedBackground?.blockId === block.id
                    ? { ...(blockPlay.get(block.id) ?? { timelineControlled: false, visible: true, animate: false }), backgroundLoop: animatedBackground }
                    : blockPlay.get(smartArtGraphicPlateMemberId(block) ?? block.id)
                }
                slideIds={slideIds}
                onNavigateToSlide={onNavigateToSlide}
                onClickAction={onClickAction}
                staticMedia={staticMedia}
                showAnimations={showAnimations}
                // A 3-D SmartArt tilts as one object here too, so present mode
                // and the rail miniature show the style that is applied rather
                // than the diagram's untilted layout.
                smartArtCamera={presentationSmartArtCameraStyle(
                  slide.blocks,
                  block,
                )}
                decorativeGroup={
                  typeof block.groupId === "string" && decorativeGroups.has(block.groupId.trim())
                }
                // Wire the block as an interactive trigger when a triggered step on
                // this slide starts "on click of" it AND a fire handler is supplied
                // (audience layout only). Clicking it fires the trigger and is
                // consumed so the stage's background advance never also runs.
                isTrigger={
                  showAnimations && onFireTrigger
                    ? triggerBlockIds.has(block.id)
                    : false
                }
                onTriggerClick={onFireTrigger}
              />
            ))
        : null}
      {overlay}
      </div>
    </div>
    </PresentationSlideNumberContext.Provider>
    </PresentationChartThemeFontContext.Provider>
    </PresentationChartThemeAccentsContext.Provider>
  );
}
