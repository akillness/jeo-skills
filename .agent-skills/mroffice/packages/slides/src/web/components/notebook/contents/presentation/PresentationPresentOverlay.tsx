"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The slideshow: the full-screen present overlay (navigation, transitions,
 * presenter view, annotations, media, teleprompter) and the Morph transition
 * layer the editor preview shares with it.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Highlighter,
  MonitorPlay,
  Pause,
  Pen,
  Play,
  Pointer,
  Repeat,
  RotateCcw,
  ScreenShare,
  Timer,
  Trash2,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { runSlideActionTarget, shownSlideActionIndex } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import {
  BASIC_TRANSITION_DURATION_MS,
  clampTransitionDuration,
  normalizeSlideTransition,
  normalizePresentationTransitionSound,
  packageTransitionSoundUrl,
  normalizeSlideTransitionDirection,
  slideTransitionClassName,
  type MorphSlideTransitionPreviewPlayback,
  type PresentationTransitionSound,
  type SlideTransitionPreviewPlayback,
} from "@mrnote/core/web/lib/presentation-transitions.ts";
import { formatElapsed, presenterCounterLabel } from "../../../../lib/presentation-presenter";
import { isTouchLikePointer } from "@mrnote/core/web/lib/pointer-capability.ts";
import type { AnnotationPoint, AnnotationTool, InkStroke } from "@mrnote/core/web/lib/presentation-annotation.ts";
import {
  formatTimingMs,
  type PresentationSlideShowRange,
  type PresentationSlideShowType,
} from "@mrnote/core/web/lib/presentation/rehearse-timings.ts";
import { morphContentChanged, morphPlan } from "../../../../lib/presentation-morph";
import {
  assetBackedPresentationAudioSource,
  normalizeEmbedKind,
  resolveEmbed,
  resolvePresentationMediaPlaybackSettings,
} from "@mrnote/core/web/lib/presentation-embed.ts";
import { useStoredPresentationAudioUrls } from "../../../../lib/presentation-stored-audio-playback";
import { getApiHttpBaseUrl } from "@mrnote/core/web/lib/env.ts";
import type { PresentationClickAction } from "@mrnote/core/web/lib/presentation-block-fx.ts";
import { slideBounds } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import type { SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import type { DeckHeaderFooter } from "@mrnote/core/web/lib/presentation-header-footer.ts";
import { isSlideHidden } from "@mrnote/core/web/lib/presentation-slide-visibility.ts";
import type {
  PresentationBlock,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { isBlockNotDrawn } from "@mrnote/core/web/lib/presentation-selection-pane.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import {
  ANNOTATION_DEFAULT_COLOR,
  EMPTY_INK_STROKES,
  ANNOTATION_COLORS,
  ANNOTATION_COLOR_NAME_KEYS,
} from "../../../../lib/presentation/ink-annotation";
import {
  morphBlockGeoOf,
  morphFrameStyle,
  presentationSmartArtCameraStyle,
} from "../../../../lib/presentation/selection-geometry";
import { presentationSlideRenderBlocks } from "../../../../lib/presentation/slide-render-blocks";
import { presentationTimelineVisibility } from "../../../../lib/presentation/block-play";
import { PresentationAnnotationLayer } from "./PresentationAnnotationLayer";
import {
  PresentationShowMediaControlsContext,
  PresentationManagedBackgroundMediaContext,
  PresentationBackgroundAudioPlayer,
  PresentationCarryAudioContext,
  PresentationPageIdContext,
  type PresentationBackgroundAudioSpec,
  type PresentationCarryAudio,
} from "./PresentationMediaContent";
import {
  PresentationHeaderFooterOverlay,
  presentationHeaderFooterPlacement,
  presentationSlideHeaderFooter,
} from "./PresentationHeaderFooterOverlay";
import { PresentationBlockView } from "./PresentationBlockView";
import { PresentationMorphOutline } from "./PresentationMorphOutline";
import { PresentationGlTransition } from "./PresentationGlTransition";
import { isGlTransitionKind } from "../../../../lib/presentation-gl-transitions";
import { PresentationMorphText, type MorphTextPair } from "./PresentationMorphText";
import { PresentationSlideView } from "./PresentationSlideView";
import { slideNarrationPlaybackSrc } from "@mrnote/core/web/lib/page-picture-objects.ts";

/** A pending morph: the slide we came FROM, the slide we morphed INTO, the layer
 * duration (ms), and a monotonic token so a rapid re-advance restarts cleanly. */
export interface MorphSpec {
  fromSlide: SlideModel;
  toSlide: SlideModel;
  durationMs: number;
  /** Bumped on every new morph so the layer remounts (fresh FROM→TO) on re-advance. */
  token: number;
  /**
   * The build groups each slide has played when the morph runs: the slide
   * left as the audience last saw it, the slide entered before its first
   * click. Absent (an editor preview, a show without animations) draws every
   * object, as the slide then does.
   */
  fromStep?: number;
  toStep?: number;
}

export type EditorTransitionPreviewPlayback =
  | (SlideTransitionPreviewPlayback & {
      readonly kind: "basic";
      readonly token: number;
    })
  | (MorphSlideTransitionPreviewPlayback & MorphSpec);

/**
 * Present-mode MORPH layer (PowerPoint / WPS "Morph" parity).
 *
 * A transient, ABSOLUTELY-positioned overlay that plays the geometry tween from
 * the previous slide into the morph slide, then calls `onDone` so the overlay
 * settles to the normal static render and unmounts this layer. It is PURELY a
 * view concern: it reads `from`/`to` block geometry and renders the destination
 * block CONTENT via the shared {@link PresentationBlockView} — it NEVER mutates a
 * slide or persists anything.
 *
 * FLIP mechanics (CSS-transition driven, no rAF animation loop):
 *  - Each matched block is rendered in a wrapper positioned at its FROM rect with
 *    a `transition: left/top/width/height/transform` of the morph duration.
 *  - On mount a layout effect FORCES A REFLOW (reads `offsetWidth` of the layer)
 *    so the browser commits the FROM rects as the transition's starting point,
 *    then flips `phase` to `"to"` inside a `requestAnimationFrame`. React re-renders
 *    the wrappers at their TO rects and the browser tweens between them.
 *  - Entering blocks fade 0→1 and leaving blocks fade 1→0 over the same window via
 *    the same `phase` flip (CSS opacity transition).
 *  - A single timer fires `onDone` after the duration. All timers / rAF handles
 *    are cleared on unmount (and the `mounted` ref guards a late `setPhase`), so
 *    a rapid advance or an Escape mid-morph leaks nothing and never setStates a
 *    torn-down layer.
 */
export function PresentationMorphLayer({
  spec,
  theme,
  masters,
  onDone,
  captured = false,
}: {
  spec: MorphSpec;
  theme?: DeckTheme;
  masters?: readonly SlideMaster[];
  onDone: () => void;
  /** Recorded frame by frame (Create a Video): no settle timer, the recorder settles it. */
  captured?: boolean;
}) {
  const { fromSlide, toSlide, durationMs, fromStep, toStep } = spec;
  // The morph paints over the DESTINATION slide's geometry/bounds (that is where
  // every matched block settles), so use the to-slide bounds for the rect math.
  const bounds = slideBounds(toSlide);
  // Each side draws exactly what its slide draws (`presentationSlideRenderBlocks`:
  // the master's and layout's inherited graphics too, the Selection Pane's
  // hidden objects not), in its paint order, less what its build has not
  // brought in or has taken away. The layer used to draw the slides' own
  // objects only, ignore the build and stack them by list position: the
  // inherited graphics vanished for the transition, an object waiting for its
  // entrance showed through it, and a card could cover its own words.
  const layer = useMemo(() => {
    const visibility = (slide: SlideModel, step: number | undefined) =>
      step === undefined
        ? null
        : presentationTimelineVisibility(slide.animationSequence ?? [], step);
    const fromVisibility = visibility(fromSlide, fromStep);
    const toVisibility = visibility(toSlide, toStep);
    const drawn = (
      slide: SlideModel,
      shown: ReturnType<typeof visibility>,
    ): PresentationBlock[] => {
      const seen = new Set<string>();
      const blocks: PresentationBlock[] = [];
      for (const { block } of presentationSlideRenderBlocks(slide, masters, theme)) {
        // First occurrence wins, mirroring the planner.
        if (seen.has(block.id) || shown?.blocks.get(block.id) === false) continue;
        seen.add(block.id);
        blocks.push(block);
      }
      return blocks;
    };
    const fromBlocks = drawn(fromSlide, fromVisibility);
    const toBlocks = drawn(toSlide, toVisibility);
    return {
      plan: morphPlan(
        fromBlocks.map((block) => morphBlockGeoOf(block, bounds)),
        toBlocks.map((block) => morphBlockGeoOf(block, bounds)),
      ),
      fromBlocks,
      toBlocks,
      fromBlockById: new Map(fromBlocks.map((block) => [block.id, block])),
      fromRows: fromVisibility?.rows,
      toRows: toVisibility?.rows,
    };
    // bounds is derived deterministically from toSlide, so toSlide/fromSlide cover it.
  }, [fromSlide, toSlide, bounds, masters, theme, fromStep, toStep]);
  const { plan } = layer;
  const matchedById = useMemo(
    () => new Map(plan.matched.map((match) => [match.id, match])),
    [plan],
  );
  // Morph by Words or Characters: the matched objects' words travel on their
  // own (`PresentationMorphText`); the objects' own words are hidden meanwhile.
  const textMode =
    toSlide.transitionDirection === "words" || toSlide.transitionDirection === "characters"
      ? toSlide.transitionDirection
      : null;
  const textPairs = useMemo<MorphTextPair[]>(() => {
    if (!textMode) return [];
    const worded = (block: PresentationBlock) => {
      const record = block as { text?: unknown };
      return typeof record.text === "string" && record.text.trim().length > 0;
    };
    return plan.matched.flatMap((match) => {
      const to = layer.toBlocks.find((block) => block.id === match.id);
      const from = layer.fromBlockById.get(match.fromId);
      if (!to || !from || (!worded(to) && !worded(from))) return [];
      return [{ id: match.id, from, to, fromGeo: match.from, toGeo: match.to }];
    });
  }, [textMode, plan, layer]);
  const textPairIds = useMemo(() => new Set(textPairs.map((pair) => pair.id)), [textPairs]);
  // The shape pairs whose outlines morph (`PresentationMorphOutline`).
  const [outlinedPairs, setOutlinedPairs] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const markOutlined = useCallback((id: string, drawn: boolean) => {
    setOutlinedPairs((current) => (current.get(id) === drawn ? current : new Map(current).set(id, drawn)));
  }, []);

  // "from" = render the start rects (matched) + start opacities (enter 0 / leave 1).
  // "to"   = render the end rects + end opacities; the CSS transitions tween between.
  const [phase, setPhase] = useState<"from" | "to">("from");
  const layerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);

  // Drive the FLIP: force a reflow so the FROM rects are committed, then flip to
  // TO on the next frame. rAF only flips one boolean — the tween itself is CSS.
  // (No initial `setPhase("from")` is needed: this component is keyed by
  // `spec.token`, so a new morph REMOUNTS it with `phase` already at its initial
  // "from" — avoiding a synchronous in-effect setState / cascading render.)
  useLayoutEffect(() => {
    mountedRef.current = true;
    const node = layerRef.current;
    // Reading layout flushes pending style/layout so the browser treats the
    // freshly-mounted FROM rects as the transition's starting geometry.
    if (node) void node.offsetWidth;
    let inner = 0;
    const raf = requestAnimationFrame(() => {
      // Double-rAF: guarantees a painted FROM frame before the TO values land,
      // so the browser has a start + end keyframe to interpolate.
      inner = requestAnimationFrame(() => {
        if (mountedRef.current) setPhase("to");
      });
    });
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(inner);
    };
    // spec.token changes (a new morph) remount this component via its key, so this
    // effect re-runs with a fresh FROM→TO; durationMs is read in the settle timer.
  }, [spec.token]);

  // Settle timer: after the duration, hand control back so the static slide renders
  // and this layer unmounts. Cleared on unmount / token change (no setState-after-
  // unmount, no leaked timer on rapid advance or Escape mid-morph).
  useEffect(() => {
    if (captured) return;
    const id = window.setTimeout(() => {
      if (mountedRef.current) onDone();
    }, durationMs);
    return () => window.clearTimeout(id);
  }, [spec.token, durationMs, onDone, captured]);

  const showTo = phase === "to";
  // The transition string applied to every matched wrapper so the browser tweens
  // position/size/rotation. ease-in-out matches the eased planner curve in spirit
  // (the CSS easing drives the actual on-screen tween; lerpGeo/easeInOutCubic are
  // the testable model + any non-CSS consumers).
  const tweenTransition =
    `left ${durationMs}ms ease-in-out, top ${durationMs}ms ease-in-out, ` +
    `width ${durationMs}ms ease-in-out, height ${durationMs}ms ease-in-out, ` +
    `transform ${durationMs}ms ease-in-out`;
  const fadeTransition = `opacity ${durationMs}ms ease-in-out`;

  // One object as its slide draws it: the block view fills a wrapper that sits
  // on the slide's own rect for it, so nothing about its look depends on the
  // layer. A tilted SmartArt member turns inside (about the diagram's centre),
  // so its wrapper carries no transform of its own.
  const renderObject = (
    block: PresentationBlock,
    slide: SlideModel,
    rows: ReadonlyMap<string, Map<number, { visible: boolean; animate: boolean }>> | undefined,
    wrapper: CSSProperties,
    kind: "matched" | "matched-from" | "entering" | "leaving",
    /** Its shape is drawn by the outline morph: only its words show here. */
    outlined = false,
    /** Its words travel on their own (Morph by Words / Characters). */
    textHidden = false,
  ) => {
    const camera = presentationSmartArtCameraStyle(slide.blocks, block);
    const blockRows = rows?.get(block.id);
    return (
      <div
        key={`morph-${kind}-${block.id}`}
        className={`presentation-present__morph-block presentation-present__morph-block--${kind}${outlined ? " presentation-present__morph-block--outlined" : ""}${textHidden ? " presentation-present__morph-block--text-hidden" : ""}`}
        data-testid={`presentation-morph-${kind}`}
        data-block-id={block.id}
        data-phase={phase}
        style={camera ? { ...wrapper, transform: undefined } : wrapper}
      >
        <PresentationBlockView
          block={block}
          bounds={bounds}
          theme={theme}
          slide={slide}
          masters={masters}
          fillParent
          smartArtCamera={camera}
          play={
            blockRows
              ? { timelineControlled: true, visible: true, animate: false, paragraphPlay: blockRows }
              : undefined
          }
        />
      </div>
    );
  };

  return (
    <div
      ref={layerRef}
      className="presentation-present__morph"
      data-testid="presentation-present-morph"
      data-duration={durationMs}
      data-matched={plan.matched.length}
      data-entering={plan.entering.length}
      data-leaving={plan.leaving.length}
      aria-hidden="true"
    >
      {/* Leaving: only on the previous slide — its own content fading out, under
          the arriving slide, in the previous slide's paint order. */}
      {plan.leaving.map((id) => {
        const block = layer.fromBlockById.get(id);
        if (!block) return null;
        return renderObject(
          block,
          fromSlide,
          layer.fromRows,
          { ...morphFrameStyle(block, bounds), opacity: showTo ? 0 : 1, transition: fadeTransition },
          "leaving",
        );
      })}
      {/* The arriving slide in its own paint order: a matched object (on both
          slides) renders the DESTINATION content tweening FROM→TO geometry; an
          entering one (only on the new slide) fades in at its place. */}
      {layer.toBlocks.map((block) => {
        const match = matchedById.get(block.id);
        if (match) {
          const from = layer.fromBlockById.get(match.fromId) ?? block;
          const frame = {
            ...(showTo ? morphFrameStyle(block, bounds) : morphFrameStyle(block, bounds, match.from, from)),
            transition: tweenTransition,
          };
          const wordsTravel = textPairIds.has(block.id);
          if (!morphContentChanged(from, block)) return renderObject(block, toSlide, layer.toRows, frame, "matched", false, wordsTravel);
          // Charts do not morph, they cross-fade, each where it stands
          // (Microsoft Support, "Morph transition: Tips and tricks").
          if (block.type === "chart" || from.type === "chart") {
            return (
              <Fragment key={`morph-chart-${block.id}`}>
                {renderObject(from, fromSlide, layer.fromRows, { ...morphFrameStyle(from, bounds), opacity: showTo ? 0 : 1, transition: fadeTransition }, "leaving")}
                {renderObject(block, toSlide, layer.toRows, { ...morphFrameStyle(block, bounds), opacity: showTo ? 1 : 0, transition: fadeTransition }, "entering")}
              </Fragment>
            );
          }
          // Its colour, formatting, shape, words or picture changed: both
          // travel together, the first giving way to the second; two shapes
          // morph their outline and blend their fill and line between.
          const fromFrame = {
            ...(showTo ? morphFrameStyle(from, bounds, match.to, block) : morphFrameStyle(from, bounds)),
            transition: `${tweenTransition}, ${fadeTransition}`,
          };
          const shapes = block.type === "shape" && from.type === "shape";
          const outlined = shapes && outlinedPairs.get(block.id) === true;
          return (
            <Fragment key={`morph-pair-${block.id}`}>
              {renderObject(from, fromSlide, layer.fromRows, { ...fromFrame, opacity: showTo ? 0 : 1 }, "matched-from", outlined, wordsTravel)}
              {shapes ? (
                <PresentationMorphOutline
                  fromBlock={from}
                  toBlock={block}
                  fromSlide={fromSlide}
                  toSlide={toSlide}
                  theme={theme}
                  masters={masters}
                  bounds={bounds}
                  frame={frame}
                  durationMs={durationMs}
                  playing={showTo}
                  onReady={(drawn) => markOutlined(block.id, drawn)}
                />
              ) : null}
              {renderObject(block, toSlide, layer.toRows, { ...frame, opacity: showTo ? 1 : 0, transition: `${tweenTransition}, ${fadeTransition}` }, "matched", outlined, wordsTravel)}
            </Fragment>
          );
        }
        return renderObject(
          block,
          toSlide,
          layer.toRows,
          { ...morphFrameStyle(block, bounds), opacity: showTo ? 1 : 0, transition: fadeTransition },
          "entering",
        );
      })}
      {textMode && textPairs.length > 0 ? (
        <PresentationMorphText
          pairs={textPairs}
          fromSlide={fromSlide}
          toSlide={toSlide}
          theme={theme}
          masters={masters}
          bounds={bounds}
          durationMs={durationMs}
          mode={textMode}
          playing={showTo}
        />
      ) : null}
    </div>
  );
}

/** A finger's travel (px) that turns the slide, and how quick it must be. */
const PRESENT_SWIPE_MIN_PX = 48;
const PRESENT_SWIPE_MAX_MS = 800;

/**
 * Fullscreen read-only Present (slideshow) overlay. Self-contained and
 * side-effect free: it only projects the slide at `presentIndex` (clamped) and
 * exposes an exit affordance. Returns `null` for an empty deck so
 * `PresentationSlideView` is never invoked with an undefined slide (which would
 * crash on `slide.blocks`/`slide.notes`). Entry into present mode is also
 * blocked on an empty deck upstream, so this is a defensive backstop.
 */
export function PresentationPresentOverlay({
  slides,
  presentIndex,
  capture,
  peekSlideTexture,
  prefetchSlideTextures,
  presentEnded = false,
  presentVisit = 0,
  headerFooter,
  deckSlideIds,
  presentStep = 1,
  presentStepSettled = false,
  showAnimations = true,
  showMediaControls = true,
  showNarrations = false,
  showRange = { kind: "all" },
  showScrollbar,
  showType = "speaker",
  presentableSlideIndices,
  firedTriggers,
  triggerReplays,
  onFireTrigger,
  onAdvance,
  onRetreat,
  onJumpToSlide,
  onClickAction,
  overlayRef,
  onExit,
  t,
  theme,
  masters,
  presenterView = false,
  onTogglePresenterView,
  elapsedMs = 0,
  timerRunning = true,
  onToggleTimer,
  onResetTimer,
  presenterWindowOpen = false,
  onOpenPresenterWindow,
  onClosePresenterWindow,
  rehearsing = false,
  onToggleRehearsing,
  rehearseTotalMs = 0,
  autoPlaying = false,
  onToggleAutoPlay,
  annotationTool = null,
  annotationColor = ANNOTATION_DEFAULT_COLOR,
  annotationStrokes,
  annotationColors,
  onSelectAnnotationTool,
  onSelectAnnotationColor,
  onAnnotationStrokeStart,
  onAnnotationStrokeAppend,
  onAnnotationStrokeFinish,
  onAnnotationErase,
  onClearAnnotations,
}: {
  slides: SlideModel[];
  presentIndex: number;
  /**
   * Recorded frame by frame (File > Export > Create a Video): the show's own
   * timers (the outgoing Push slide, the Morph layer) do not run; each new
   * `settleToken` settles them instead, as their timers would have.
   */
  capture?: {
    readonly settleToken: number;
    /** The recording's frame length: builds wait for a transition on its frames. */
    readonly frameMs?: number;
  };
  /**
   * Pictures of slides for the transitions drawn in 3-D
   * (`PresentationGlTransition`): `peekSlideTexture` gives one already made,
   * `prefetchSlideTextures` asks for those the show will need next. Absent,
   * every transition is the CSS one.
   */
  peekSlideTexture?: (slide: SlideModel) => ImageBitmap | null;
  prefetchSlideTextures?: (slides: readonly SlideModel[]) => void;
  /** Changes when the show enters the slide it is already on, to replay it. */
  /** Past the last slide: the black End of slide show screen (PPT-B128). */
  presentEnded?: boolean;
  presentVisit?: number;
  /** The deck's Header & Footer, drawn on each slide as the editor draws it. */
  headerFooter?: DeckHeaderFooter;
  /** Every slide id of the deck in order: slide numbers follow the deck. */
  deckSlideIds?: readonly string[];
  /**
   * How many animation-timeline click-groups of the current slide are revealed
   * (1 = only the leading auto group). Drives progressive block reveal. Defaults
   * to 1 so a slide with no timeline behaves exactly as before.
   */
  presentStep?: number;
  /**
   * The revealed builds are the slide's end state returned to from the next
   * slide: shown as played, none replaying (PPT-B036).
   */
  presentStepSettled?: boolean;
  /** False implements Set Up Show's presentation-wide animation suppression. */
  showAnimations?: boolean;
  /** False hides native audio/video controls only in the slide-show projection. */
  showMediaControls?: boolean;
  /** True auto-plays the current slide's modeled narration clip. */
  showNarrations?: boolean;
  /** The configured all-slides or inclusive 1-based range. */
  showRange?: PresentationSlideShowRange;
  /** Window-mode navigation scrollbar from p:browse@showScrollbar. */
  showScrollbar?: boolean;
  /** Presenter, windowed browse, or locked kiosk projection. */
  showType?: PresentationSlideShowType;
  /** Parent-resolved range + hidden-slide sequence shared with presenter views. */
  presentableSlideIndices?: readonly number[];
  /**
   * The interactive trigger block ids the audience has clicked on the CURRENT
   * slide (PowerPoint "Trigger → On Click of"). A triggered step is revealed only
   * when its `triggerBlockId` is in this set. Undefined/empty → no triggered steps
   * are revealed, the byte-for-byte default for slides without triggers.
   */
  firedTriggers?: ReadonlySet<string>;
  /** How many times each fired trigger was clicked again to play its effects again. */
  triggerReplays?: ReadonlyMap<string, number>;
  /**
   * Fire an interactive trigger (the audience clicked a block that a triggered
   * step starts "on click of"). The handler adds the id to the fired set WITHOUT
   * advancing the normal click sequence. Absent → trigger blocks are inert (the
   * presenter-view / preview render path passes no handler).
   */
  onFireTrigger?: (blockId: string) => void;
  /** Reveal the next group / advance the slide. ``pointer`` is a click on
   * the slide itself, which Transitions > On Mouse Click gates; ``control``
   * is the show's own Next button, which advances as the keys do. */
  onAdvance?: (source?: "pointer" | "control") => void;
  /** Existing previous animation-group / slide command, without model writes. */
  onRetreat?: () => void;
  /** Jump to a slide by INDEX (internal `slide://` block link click). */
  /**
   * Jump to a deck slide. `explicit` marks a link that names THIS slide (by
   * id): it opens the slide even when it is hidden, as PowerPoint does, while
   * relative jumps and the scrollbar keep skipping hidden slides.
   */
  onJumpToSlide?: (index: number, explicit?: boolean) => void;
  /** Execute an Action Button against live presenter state/media. */
  onClickAction?: (action: PresentationClickAction) => void;
  overlayRef: RefObject<HTMLDivElement | null>;
  onExit: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
  /** Deck-level theme applied as the default for every projected slide/block. */
  theme?: DeckTheme;
  /** Deck-level masters slides may inherit layout + style overrides from. */
  masters?: readonly SlideMaster[];
  /**
   * When true the overlay renders the speaker console (presenter view): a large
   * current slide, a NEXT-slide preview, the current slide's speaker notes, the
   * slide counter, and an elapsed timer with pause/reset controls. When false
   * it renders the normal full-bleed audience layout. Toggled by the caller via
   * a button / the `S` key; both layouts share this single overlay so audience
   * present mode is never regressed.
   */
  presenterView?: boolean;
  onTogglePresenterView?: () => void;
  /** Elapsed present-mode time in ms; only surfaced in presenter view. */
  elapsedMs?: number;
  timerRunning?: boolean;
  onToggleTimer?: () => void;
  onResetTimer?: () => void;
  /**
   * Whether the SECOND-SCREEN presenter view (a separate window) is currently
   * open. While true THIS overlay stays on the clean AUDIENCE layout (the
   * console lives in the other window) and surfaces a "close presenter window"
   * affordance instead of the in-window presenter toggle. Default false →
   * unchanged single-window behaviour.
   */
  presenterWindowOpen?: boolean;
  /** Open the second-screen presenter window (audience-clean affordance). */
  onOpenPresenterWindow?: () => void;
  /** Close the second-screen presenter window. */
  onClosePresenterWindow?: () => void;
  /**
   * Whether REHEARSE-TIMINGS recording is active (PowerPoint "Rehearse
   * Timings"): while true, the overlay surfaces a live running total and the
   * rehearse toggle reads as "stop". Default false → no rehearse affordance
   * state, byte-for-byte unchanged.
   */
  rehearsing?: boolean;
  onToggleRehearsing?: () => void;
  /** Running rehearse total (ms): banked per-slide time + the live dwell. */
  rehearseTotalMs?: number;
  /**
   * Whether the KIOSK / auto-advance self-running loop is active. While true the
   * play toggle reads as "stop auto-advance" and the audience layout keeps
   * cycling. Default false.
   */
  autoPlaying?: boolean;
  onToggleAutoPlay?: () => void;
  /**
   * ANNOTATION (PowerPoint "Pen / Laser pointer"): the active draw tool, or
   * `null` when off. When set, the audience stage mounts a transparent SVG draw
   * layer (and the toolbar highlights the active tool). Default `null` → no draw
   * layer, byte-for-byte unchanged. The annotation toolbar + draw layer are only
   * wired when `onSelectAnnotationTool` is supplied (the preview / presenter-view
   * render paths pass none).
   */
  annotationTool?: AnnotationTool | null;
  /** The current ink colour (pen / highlighter strokes + laser dot hue). */
  annotationColor?: string;
  /** The CURRENT slide's saved ink strokes (cleared on present exit). */
  annotationStrokes?: readonly InkStroke[];
  /** The selectable ink colour swatches shown in the toolbar. */
  annotationColors?: readonly string[];
  /** Switch the active draw tool (or `null` to turn drawing off). */
  onSelectAnnotationTool?: (tool: AnnotationTool | null) => void;
  /** Pick a new ink colour. */
  onSelectAnnotationColor?: (color: string) => void;
  /** Begin / extend / commit an ink stroke; erase a touched stroke. */
  onAnnotationStrokeStart?: (point: AnnotationPoint) => void;
  onAnnotationStrokeAppend?: (point: AnnotationPoint) => void;
  onAnnotationStrokeFinish?: () => void;
  onAnnotationErase?: (point: AnnotationPoint) => void;
  /** Clear all ink on the current slide. */
  onClearAnnotations?: () => void;
}) {
  const lastIndex = Math.max(0, slides.length - 1);
  const clampedIndex = Math.min(presentIndex, lastIndex);
  const presentingSlide = slides[clampedIndex];
  const [headerFooterNow] = useState(() => new Date());
  const presentingDeckIndex = presentingSlide
    ? Math.max(0, deckSlideIds?.indexOf(presentingSlide.id) ?? clampedIndex)
    : 0;
  const presentingSlideNumber = presentingSlide
    ? presentingDeckIndex +
      (presentationSlideHeaderFooter(headerFooter, presentingSlide, masters, theme)?.firstSlideNumber ?? 1)
    : undefined;
  const presentingHeaderFooter = presentingSlide
    ? (
        <PresentationHeaderFooterOverlay
          resolved={presentationSlideHeaderFooter(headerFooter, presentingSlide, masters, theme)}
          deckIndex={presentingDeckIndex}
          now={headerFooterNow}
          testIdPrefix="presentation-present"
          placement={presentationHeaderFooterPlacement(presentingSlide, masters)}
        />
      )
    : null;
  // A stored clip (Insert > Audio, presentation-embed) plays through a link
  // its page's route mints; the slide's clips are asked for as it shows.
  const storedAudioPageId = useContext(PresentationPageIdContext);
  const storedSlideAudios = useMemo(
    () =>
      (presentingSlide?.blocks ?? []).flatMap((block) => {
        const stored =
          block.type === "embed"
            ? assetBackedPresentationAudioSource(block as unknown as Record<string, unknown>)
            : null;
        return stored ? [stored] : [];
      }),
    [presentingSlide],
  );
  const storedAudioUrls = useStoredPresentationAudioUrls(storedAudioPageId, storedSlideAudios);
  // Transitions > Sound: the slide's sound starts with its transition and
  // plays to its end, on into the next slides (PowerPoint plays it through;
  // the slide does not wait for it). The next transition sound stops it; a
  // slide with no sound of its own leaves it playing.
  const [transitionSoundPlay, setTransitionSoundPlay] = useState<{
    readonly key: string;
    readonly sound: PresentationTransitionSound;
  } | null>(null);
  useEffect(() => {
    if (!presentingSlide || presentEnded) return;
    const sound = normalizePresentationTransitionSound(presentingSlide.transitionSound);
    if (sound) setTransitionSoundPlay({ key: `${clampedIndex}-${presentVisit}`, sound });
    // The slide entered (and the visit) is the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedIndex, presentVisit, presentEnded]);
  const transitionSoundStored = useMemo(
    () => (transitionSoundPlay && "assetId" in transitionSoundPlay.sound ? [transitionSoundPlay.sound] : []),
    [transitionSoundPlay],
  );
  const transitionSoundUrls = useStoredPresentationAudioUrls(storedAudioPageId, transitionSoundStored);
  const transitionSoundSrc = !transitionSoundPlay
    ? null
    : "dataUrl" in transitionSoundPlay.sound
      ? transitionSoundPlay.sound.dataUrl
      : "fingerprint" in transitionSoundPlay.sound
        ? storedAudioPageId
          ? packageTransitionSoundUrl(getApiHttpBaseUrl(), storedAudioPageId, transitionSoundPlay.sound)
          : null
        : transitionSoundUrls.get(transitionSoundPlay.sound.assetId) ?? null;
  const currentBackgroundAudios = useMemo<
    readonly PresentationBackgroundAudioSpec[]
  >(() => {
    if (!presentingSlide) return [];
    return presentingSlide.blocks.flatMap((block) => {
      // An object hidden in the Selection Pane is not on the slide in the show,
      // background audio included; its own Hide During Show below is a
      // different thing, the icon's (PPT-B104).
      if (
        block.type !== "embed" ||
        normalizeEmbedKind(block.kind) !== "audio" ||
        isBlockNotDrawn(block)
      ) {
        return [];
      }
      const playback = resolvePresentationMediaPlaybackSettings(
        block.playback,
        "audio",
      );
      // PowerPoint Web's Play in Background preset is the honest automatic +
      // cross-slide + hidden combination. A merely imported cross-slide atom
      // with a clickable/visible control stays preserve-only rather than being
      // silently coerced into a different audience behavior.
      if (
        playback.start !== "automatic" ||
        !playback.playAcrossSlides ||
        !playback.hideDuringShow
      ) {
        return [];
      }
      const resolved = resolveEmbed({ kind: block.kind, url: block.url });
      const stored = assetBackedPresentationAudioSource(
        block as unknown as Record<string, unknown>,
      );
      const src = resolved.url ?? (stored ? storedAudioUrls.get(stored.assetId) : undefined);
      if (!src) return [];
      return [
        {
          blockId: block.id,
          sourceIndex: clampedIndex,
          src,
          title: block.title?.trim() || "Audio",
          playback,
        },
      ];
    });
  }, [clampedIndex, presentingSlide, storedAudioUrls]);
  const [activeBackgroundAudios, setActiveBackgroundAudios] = useState<
    readonly PresentationBackgroundAudioSpec[]
  >([]);
  const managedBackgroundAudios = useMemo(() => {
    const byBlockId = new Map(
      activeBackgroundAudios
        .filter((spec) => spec.sourceIndex <= clampedIndex)
        .map((spec) => [spec.blockId, spec] as const),
    );
    for (const spec of currentBackgroundAudios) {
      byBlockId.set(spec.blockId, spec);
    }
    return [...byBlockId.values()];
  }, [activeBackgroundAudios, clampedIndex, currentBackgroundAudios]);
  useEffect(() => {
    setActiveBackgroundAudios((current) => {
      const byBlockId = new Map(
        current
          .filter((spec) => spec.sourceIndex <= clampedIndex)
          .map((spec) => [spec.blockId, spec] as const),
      );
      for (const spec of currentBackgroundAudios) {
        byBlockId.set(spec.blockId, spec);
      }
      const next = [...byBlockId.values()];
      return next.length === current.length &&
        next.every((spec, index) => spec === current[index])
        ? current
        : next;
    });
  }, [clampedIndex, currentBackgroundAudios]);
  const managedBackgroundMediaIds = useMemo<ReadonlySet<string>>(
    () => new Set(managedBackgroundAudios.map((spec) => spec.blockId)),
    [managedBackgroundAudios],
  );
  // Play Across Slides with the clip's control on show (or started by a
  // click): the slide's own player goes with its slide, so a clip still
  // playing when the show moves on is handed to the show's player at the same
  
  // to another slide -- not when it ends, nor when the same slide redraws.
  const shownIndexRef = useRef(clampedIndex);
  const carriedAudiosRef = useRef<Omit<PresentationBackgroundAudioSpec, "sourceIndex">[]>([]);
  const carryAudio = useCallback<PresentationCarryAudio>((spec) => {
    carriedAudiosRef.current.push(spec);
  }, []);
  useLayoutEffect(() => {
    // One hand-over per clip, the last one made (a slide drawn twice, as the
    // presenter view draws it, hands its clip over twice).
    const carried = [
      ...new Map(carriedAudiosRef.current.map((spec) => [spec.blockId, spec] as const)).values(),
    ];
    const from = shownIndexRef.current;
    shownIndexRef.current = clampedIndex;
    if (carried.length === 0 || clampedIndex <= from) return;
    setActiveBackgroundAudios((current) => [
      ...current.filter((spec) => !carried.some((next) => next.blockId === spec.blockId)),
      ...carried.map((spec) => ({ ...spec, sourceIndex: from })),
    ]);
  }, [clampedIndex]);
  // The show is a modal layer: Tab and Shift+Tab go round its own controls
  
  // the last pen button the focus went to a hidden window's Close button).
  const captured = capture !== undefined;
  useEffect(() => {
    // A recorded show is no modal layer: the window around it keeps its keys.
    if (captured) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const root = overlayRef.current;
      if (!root?.isConnected) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.closest('[hidden], [aria-hidden="true"], [inert]'));
      if (focusable.length === 0) return;
      const active = root.ownerDocument.activeElement;
      const inside = active instanceof Node && root.contains(active);
      const index = active instanceof HTMLElement ? focusable.indexOf(active) : -1;
      const wrap = !inside || index === -1 || (event.shiftKey ? index === 0 : index === focusable.length - 1);
      if (!wrap) return;
      event.preventDefault();
      (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus({ preventScroll: true });
    };
    const doc = overlayRef.current?.ownerDocument ?? document;
    doc.addEventListener("keydown", onKeyDown, true);
    return () => doc.removeEventListener("keydown", onKeyDown, true);
  }, [overlayRef, captured]);
  // A hand-over the commit did not take (the show ended, or the slide only
  // redrew) is dropped with it.
  useLayoutEffect(() => {
    carriedAudiosRef.current = [];
  });
  const narrationSource = slideNarrationPlaybackSrc(presentingSlide?.narration);
  const scrollStart =
    showRange.kind === "range"
      ? Math.min(Math.max(0, showRange.start - 1), lastIndex)
      : 0;
  const scrollEnd =
    showRange.kind === "range"
      ? Math.min(Math.max(scrollStart, showRange.end - 1), lastIndex)
      : lastIndex;
  const resolvedShowScrollbar =
    showType === "window" ? (showScrollbar ?? true) : false;
  // The entrance the projected slide plays, chosen once per slide ENTRY (a
  // Random transition is rolled then). Clicking through the object animations
  // of the same slide changes `presentStep` only, which must not re-roll the
  // choice: a different class would replay the whole-slide entrance over the
  // one object the audience asked to reveal.
  const presentingTransitionClassName = useMemo(
    () =>
      slideTransitionClassName(
        presentingSlide?.transition,
        presentingSlide?.transitionDirection,
        Math.random,
      ),
    [
      clampedIndex,
      presentingSlide?.id,
      presentingSlide?.transition,
      presentingSlide?.transitionDirection,
    ],
  );
  // A transition PowerPoint draws in 3-D is drawn with WebGL from pictures of
  // the two slides when both are made (`PresentationGlTransition`); else the
  // CSS one plays. Decided while rendering the slide entered, from the slide
  // last shown, so the CSS class never starts under the canvas.
  const glShownRef = useRef<number | null>(null);
  const glVisitKey = `${clampedIndex}-${presentVisit}`;
  const [glEnded, setGlEnded] = useState<string | null>(null);
  // The visit whose 3-D transition could not be drawn: its CSS one plays.
  const [glFellBack, setGlFellBack] = useState<string | null>(null);
  const glPlan = useMemo(() => {
    const previous = glShownRef.current;
    const target = slides[clampedIndex];
    if (previous === null || clampedIndex !== previous + 1 || presenterView || !showAnimations || !target || !peekSlideTexture) {
      return null;
    }
    const kind = normalizeSlideTransition(target.transition);
    if (!isGlTransitionKind(kind)) return null;
    const leaving = slides[previous];
    const from = leaving ? peekSlideTexture(leaving) : null;
    const to = peekSlideTexture(target);
    if (!from || !to) return null;
    return {
      key: glVisitKey,
      kind,
      direction: normalizeSlideTransitionDirection(kind, target.transitionDirection),
      durationMs: target.transitionDurationMs !== undefined ? clampTransitionDuration(target.transitionDurationMs) : BASIC_TRANSITION_DURATION_MS,
      from,
      to,
    };
    // The slide entered (and the visit) is the event; the rest is read then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glVisitKey]);
  useEffect(() => {
    glShownRef.current = clampedIndex;
    // The slide shown and the next one, when the next one enters in 3-D.
    const current = slides[clampedIndex];
    const next = slides[clampedIndex + 1];
    if (current && next && isGlTransitionKind(normalizeSlideTransition(next.transition))) {
      prefetchSlideTextures?.([current, next]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedIndex]);
  const glActive = glPlan !== null && glEnded !== glPlan.key;
  useEffect(() => {
    if (capture?.settleToken !== undefined && glPlan) setGlEnded(glPlan.key);
    // A recording settles the transition with the rest of its layers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture?.settleToken]);
  // Push moves the previous slide off the stage in step with the new one
  // coming in; without an outgoing layer the stage showed its dark floor
  // beside the entering slide (PPT-B378). The outgoing slide is kept for the
  // transition's duration, then dropped.
  const [pushExit, setPushExit] = useState<{
    slide: SlideModel;
    /** "hold": the slide stays where it is while the new one is revealed
     * over it (Wipe, Shape, Split). */
    direction: "left" | "right" | "up" | "down" | "hold";
    durationMs: number;
    key: number;
    /** The build groups the slide had played when it was left. */
    step?: number;
  } | null>(null);
  // The build step the projected slide stood at, as of the last commit: read
  // by the navigation effects below (declared before the effect that writes
  // it) as the step the slide being left was shown at.
  const leftStepRef = useRef<{ index: number; step: number } | null>(null);
  const pushPreviousRef = useRef<{ index: number; slide: SlideModel } | null>(null);
  
  const swipeRef = useRef<{ id: number; x: number; y: number; at: number } | null>(null);
  const swipedAtRef = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    const previous = pushPreviousRef.current;
    if (presentingSlide) pushPreviousRef.current = { index: clampedIndex, slide: presentingSlide };
    // Wipe, Shape and Split reveal the new slide over the one left, which
    // stays put under it: without it the part not yet revealed showed the
    
    // cross the old slide into the new one, never through black (probe
    // slides 9-12 in PowerPoint's video; ours faded up from black, and a
    // 10 ms fade drew one black frame at every slide change).
    const direction = (presentingTransitionClassName?.match(/--enter-push-(left|right|up|down)$/)?.[1] ??
      (/--enter-(?:(?:wipe|shape|split)-|(?:fade|dissolve)$)/.test(presentingTransitionClassName ?? "")
        ? "hold"
        : undefined)) as
      | "left" | "right" | "up" | "down" | "hold" | undefined;
    if (!previous || previous.index === clampedIndex || !direction || !presentingSlide) return;
    const durationMs =
      presentingSlide.transitionDurationMs !== undefined
        ? clampTransitionDuration(presentingSlide.transitionDurationMs)
        : BASIC_TRANSITION_DURATION_MS;
    const left = leftStepRef.current;
    setPushExit({
      slide: previous.slide,
      direction,
      durationMs,
      key: Date.now(),
      ...(showAnimations && left?.index === previous.index ? { step: left.step } : {}),
    });
    if (capture) return;
    const timer = window.setTimeout(() => setPushExit(null), durationMs + 50);
    return () => window.clearTimeout(timer);
    // The transition class is derived from the slide; the index is the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedIndex, presentVisit]);

  // ── MORPH transition state ────────────────────────────────────────────────
  // A pending morph plays when present mode advances FORWARD into a slide whose
  // transition is "morph" AND a previous slide exists. It is PURELY a view layer:
  // it never mutates/persists slide data. Detection compares the projected index
  // against the index from the previous render: a forward move (new > prev) into a
  // morph slide morphs from the IMMEDIATELY PREVIOUS slide into the new one.
  // Backward moves, jumps to the first slide, and non-morph slides clear it.
  const [morph, setMorph] = useState<MorphSpec | null>(null);
  const prevIndexRef = useRef<number | null>(null);
  const morphTokenRef = useRef(0);
  useEffect(() => {
    const prev = prevIndexRef.current;
    prevIndexRef.current = clampedIndex;
    const target = slides[clampedIndex];
    // First projection of this overlay instance establishes a baseline only — the
    // entered slide is shown statically, never morphed (there's nothing to morph
    // FROM on entry). Presenter view also skips morph (it's an audience effect).
    if (prev === null) return;
    if (prev === clampedIndex) return; // step within a slide (timeline group), not a slide change
    // Morph plays ONLY on an ADJACENT forward advance (the next-slide step), like
    // PowerPoint — a non-adjacent jump (End key, a slide:// link) must NOT morph
    // from the deck-order previous slide the audience never saw. This also makes
    // `slides[clampedIndex - 1]` exactly the slide we are leaving.
    const movedForward = clampedIndex === prev + 1;
    const fromSlide = slides[clampedIndex - 1];
    if (
      movedForward &&
      !presenterView &&
      target &&
      fromSlide &&
      normalizeSlideTransition(target.transition) === "morph"
    ) {
      morphTokenRef.current += 1;
      const left = leftStepRef.current;
      setMorph({
        fromSlide,
        toSlide: target,
        durationMs: clampTransitionDuration(target.transitionDurationMs),
        token: morphTokenRef.current,
        // Each slide as the audience sees it: the one left at the step it was
        // left at, the one entered before its first build plays (a revealed
        // group that has not settled is still to play, after the morph).
        ...(showAnimations
          ? {
              ...(left?.index === prev ? { fromStep: left.step } : {}),
              toStep: presentStepSettled ? presentStep : Math.max(0, presentStep - 1),
            }
          : {}),
      });
    } else {
      // Any non-morph navigation cancels an in-flight morph immediately.
      setMorph(null);
    }
    // clampedIndex is the only navigation signal; presenterView gates audience-only
    // playback. slides is stable within a present session for the projected slide.
    // The steps are read as they stand at the navigation, not followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedIndex, presenterView, slides]);
  // Written after the navigation effects have read it (effects run in order).
  useEffect(() => {
    leftStepRef.current = { index: clampedIndex, step: presentStep };
  }, [clampedIndex, presentStep]);
  // A transition drawn in 3-D covers the slide from outside its own class
  // (the slide is drawn under the canvas): its length, read as the slide is
  // entered and kept for the visit, so the builds the slide starts by itself
  // wait for it as PowerPoint plays them -- after the transition. (A Morph
  // keeps the slide's content unmounted until it settles, and the builds
  // start as the content comes back.)
  const entranceLeadMs = useMemo(() => {
    const kind = normalizeSlideTransition(presentingSlide?.transition);
    if (!presentingSlide || !isGlTransitionKind(kind)) return 0;
    return presentingSlide.transitionDurationMs !== undefined
      ? clampTransitionDuration(presentingSlide.transitionDurationMs)
      : BASIC_TRANSITION_DURATION_MS;
    // Read as the slide is entered (the visit), not followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedIndex, presentVisit]);
  const settleMorph = useCallback(() => setMorph(null), []);
  // A recorded show settles its transition layers when the recorder says so.
  const captureSettleToken = capture?.settleToken;
  useEffect(() => {
    if (captureSettleToken === undefined) return;
    setPushExit(null);
    setMorph(null);
  }, [captureSettleToken]);

  // Empty deck: nothing to project. Render no overlay rather than passing an
  // undefined slide into PresentationSlideView. (Hooks above run unconditionally
  // so this early return never changes the hook order.)
  if (!presentingSlide) return null;
  // A morph is "active" only while one is pending AND it targets the slide we are
  // currently projecting (a stale spec from a since-changed index never plays) AND
  // we are in the AUDIENCE layout (presenter view never shows a morph). Toggling
  // INTO presenter view mid-morph hides the layer via this derived gate; the
  // settle timer still fires and clears the pending spec, so nothing leaks.
  const activeMorph =
    morph && !presenterView && morph.toSlide.id === presentingSlide.id
      ? morph
      : null;
  // Derived purely from pure helpers so both layouts report identical numbers
  // and the next-slide preview / end-of-deck state stay consistent.
  const fallbackPresentableIndices = slides.flatMap((slide, index) =>
    index >= scrollStart && index <= scrollEnd && !isSlideHidden(slide)
      ? [index]
      : [],
  );
  const presentableIndices =
    presentableSlideIndices && presentableSlideIndices.length > 0
      ? presentableSlideIndices
      : fallbackPresentableIndices;
  const presentablePosition = Math.max(
    0,
    presentableIndices.indexOf(clampedIndex),
  );
  const counter = presenterCounterLabel(clampedIndex, slides.length);
  const nextIndex = presentableIndices[presentablePosition + 1] ?? null;
  const nextSlide = nextIndex === null ? null : slides[nextIndex];
  // The set of every slide id, so an internal `slide://` block link is validated
  // against an EXISTING slide before its jump is wired (a link to a deleted
  // slide is inert). Built per render from the live deck.
  const slideIds = new Set(slides.map((slide) => slide.id));
  // Resolve an internal slide link's target id → its index and jump there. A
  // dangling id (no matching slide) is a no-op. Disabled when no jump handler is
  // supplied (the projected block then renders without a clickable jump).
  const navigateToSlideById = onJumpToSlide
    ? (slideId: string) => {
        const relative = runSlideActionTarget(slideId);
        if (relative) {
          // Every relative target walks the SHOWN order, as the toolbar's and
          // Home / End do: handed a hidden neighbour, Next used to land on
          // the current slide again (PPT-B237), and a hidden last slide left
          
          const index = shownSlideActionIndex(relative, clampedIndex, slides.length, (at) =>
            isSlideHidden(slides[at]),
          );
          if (index >= 0) onJumpToSlide(index, true);
          return;
        }
        const index = slides.findIndex((slide) => slide.id === slideId);
        if (index >= 0) onJumpToSlide(index, true);
      }
    : undefined;
  // The in-window presenter console toggle (single-window mode). Hidden while
  // the SECOND-SCREEN presenter window is open — the console then lives in the
  // other window and this overlay stays purely the clean audience view.
  const presenterToggle =
    onTogglePresenterView && !presenterWindowOpen ? (
      <button
        type="button"
        className="office-ribbon-control presentation-present__presenter-toggle"
        onClick={onTogglePresenterView}
        title={
          presenterView
            ? t("presentation.exitPresenterView")
            : t("presentation.presenterView")
        }
        aria-label={
          presenterView
            ? t("presentation.exitPresenterView")
            : t("presentation.presenterView")
        }
        aria-pressed={presenterView}
        data-testid="presentation-presenter-toggle"
      >
        <MonitorPlay size={18} />
      </button>
    ) : null;
  // Open / close the SECOND-SCREEN presenter window from inside the overlay.
  // Only shown in the audience layout (the console window is the alternative to
  // the in-overlay console, so it is meaningless on the presenter layout).
  const presenterWindowControl =
    !presenterView && (onOpenPresenterWindow || onClosePresenterWindow) ? (
      <button
        type="button"
        className="office-ribbon-control presentation-present__presenter-window"
        onClick={
          presenterWindowOpen ? onClosePresenterWindow : onOpenPresenterWindow
        }
        title={
          presenterWindowOpen
            ? t("presentation.closePresenterView")
            : t("presentation.openPresenterView")
        }
        aria-label={
          presenterWindowOpen
            ? t("presentation.closePresenterView")
            : t("presentation.openPresenterView")
        }
        aria-pressed={presenterWindowOpen}
        data-testid="presentation-present-window-toggle"
      >
        <ScreenShare size={18} />
      </button>
    ) : null;
  // A finger's horizontal swipe on the slide turns it, as in PowerPoint for
  // iPad's slide show (swipe left: next, swipe right: previous); a tap
  // advances (the stage's click). Not while an annotation tool draws.
  const swipeHandlers = {
    onPointerDown: (event: ReactPointerEvent) => {
      swipeRef.current =
        isTouchLikePointer(event) && annotationTool === null && event.isPrimary !== false
          ? { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() }
          : null;
    },
    onPointerUp: (event: ReactPointerEvent) => {
      const start = swipeRef.current;
      swipeRef.current = null;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (
        Math.abs(dx) < PRESENT_SWIPE_MIN_PX ||
        Math.abs(dx) < Math.abs(dy) * 1.5 ||
        performance.now() - start.at > PRESENT_SWIPE_MAX_MS
      ) {
        return;
      }
      swipedAtRef.current = performance.now();
      if (dx < 0) onAdvance?.();
      else onRetreat?.();
    },
    onPointerCancel: () => {
      swipeRef.current = null;
    },
    // the swipe was the turn: its trailing click does not advance again
    onClickCapture: (event: ReactMouseEvent) => {
      if (performance.now() - swipedAtRef.current < 500) {
        event.stopPropagation();
        swipedAtRef.current = Number.NEGATIVE_INFINITY;
      }
    },
  };
  const exitButton = (
    <button
      type="button"
      className="office-ribbon-control presentation-present__exit"
      onClick={onExit}
      title={t("presentation.exitPresent")}
      aria-label={t("presentation.exitPresent")}
      data-testid="presentation-present-exit"
    >
      <X size={18} />
    </button>
  );
  const narrationPlayer =
    showNarrations && narrationSource ? (
      <audio
        key={`presentation-narration-${presentingSlide.id}`}
        autoPlay
        hidden
        src={narrationSource}
        data-testid="presentation-present-narration"
      />
    ) : null;
  // REHEARSE-TIMINGS toggle: start/stop recording per-slide dwell. Surfaces a
  // live running total while active. Hidden when no handler is wired (the
  // preview render path passes none → byte-for-byte unchanged there).
  const rehearseToggle = onToggleRehearsing ? (
    <button
      type="button"
      className="office-ribbon-control presentation-present__rehearse-toggle"
      onClick={onToggleRehearsing}
      title={
        rehearsing
          ? t("presentation.rehearseStop")
          : t("presentation.rehearseStart")
      }
      aria-label={
        rehearsing
          ? t("presentation.rehearseStop")
          : t("presentation.rehearseStart")
      }
      aria-pressed={rehearsing}
      data-testid="presentation-present-rehearse"
      data-active={rehearsing ? "true" : "false"}
    >
      <Timer size={18} />
      {rehearsing ? (
        <span
          className="presentation-present__rehearse-readout"
          data-testid="presentation-present-rehearse-readout"
        >
          {formatTimingMs(rehearseTotalMs)}
        </span>
      ) : null}
    </button>
  ) : null;
  // KIOSK / auto-advance toggle: start/stop the self-running looping show.
  const autoPlayToggle = onToggleAutoPlay ? (
    <button
      type="button"
      className="office-ribbon-control presentation-present__autoplay-toggle"
      onClick={onToggleAutoPlay}
      title={
        autoPlaying
          ? t("presentation.autoAdvanceStop")
          : t("presentation.autoAdvanceStart")
      }
      aria-label={
        autoPlaying
          ? t("presentation.autoAdvanceStop")
          : t("presentation.autoAdvanceStart")
      }
      aria-pressed={autoPlaying}
      data-testid="presentation-present-autoplay"
      data-active={autoPlaying ? "true" : "false"}
    >
      <Repeat size={18} />
    </button>
  ) : null;

  // ANNOTATION toolbar (laser / pen / highlighter / eraser + colour + clear).
  // Only wired when a tool-select handler is supplied (audience layout); the
  // preview + presenter-view render paths pass none → unchanged there. Selecting
  // the already-active tool toggles it back off (returns to click-to-advance).
  const swatches = annotationColors ?? ANNOTATION_COLORS;
  const annotationToolbar = onSelectAnnotationTool ? (
    <div
      className="presentation-present__annot-toolbar"
      data-testid="presentation-annotation-toolbar"
      role="toolbar"
      aria-label={t("presentation.annotationLayerLabel")}
      // Buttons sit above the stage; stop a click here from bubbling to the
      // stage's advance handler.
      onClick={(event) => event.stopPropagation()}
    >
      {(
        [
          {
            tool: "laser",
            icon: <Pointer size={16} />,
            label: t("presentation.annotationLaser"),
          },
          {
            tool: "pen",
            icon: <Pen size={16} />,
            label: t("presentation.annotationPen"),
          },
          {
            tool: "highlighter",
            icon: <Highlighter size={16} />,
            label: t("presentation.annotationHighlighter"),
          },
          {
            tool: "eraser",
            icon: <Eraser size={16} />,
            label: t("presentation.annotationEraser"),
          },
        ] as const
      ).map(({ tool, icon, label }) => (
        <button
          key={tool}
          type="button"
          className="office-ribbon-control presentation-present__annot-btn"
          onClick={() =>
            onSelectAnnotationTool(annotationTool === tool ? null : tool)
          }
          title={label}
          aria-label={label}
          aria-pressed={annotationTool === tool}
          data-testid={`presentation-annotation-tool-${tool}`}
          data-active={annotationTool === tool ? "true" : "false"}
        >
          {icon}
        </button>
      ))}
      {/* Colour swatches: only meaningful while an INK tool is active (laser hue
          also follows the selected colour, so they apply to laser too; hidden
          for the eraser where colour is irrelevant). */}
      {annotationTool !== null && annotationTool !== "eraser" ? (
        <div
          className="presentation-present__annot-swatches"
          data-testid="presentation-annotation-swatches"
        >
          {swatches.map((swatch) => {
            const colorKey = ANNOTATION_COLOR_NAME_KEYS[swatch.toLowerCase()];
            const label = colorKey
              ? `${t("presentation.annotationColor")}: ${t(`spreadsheet.colorName.${colorKey}`)}`
              : `${t("presentation.annotationColor")}: ${swatch}`;
            return (
            <button
              key={swatch}
              type="button"
              className="office-ribbon-control presentation-present__annot-swatch"
              onClick={() => onSelectAnnotationColor?.(swatch)}
              title={label}
              aria-label={label}
              aria-pressed={annotationColor === swatch}
              data-active={annotationColor === swatch ? "true" : "false"}
              data-testid="presentation-annotation-swatch"
              style={{ background: swatch }}
            />
            );
          })}
        </div>
      ) : null}
      <button
        type="button"
        className="office-ribbon-control presentation-present__annot-btn presentation-present__annot-clear"
        onClick={() => onClearAnnotations?.()}
        title={t("presentation.annotationClear")}
        aria-label={t("presentation.annotationClear")}
        disabled={(annotationStrokes?.length ?? 0) === 0}
        data-testid="presentation-annotation-clear"
      >
        <Trash2 size={16} />
      </button>
    </div>
  ) : null;

  // The draw layer mounted INSIDE the audience slide box (via the slide view's
  // `overlay` prop), while drawing is wired and either a tool is armed or the
  // slide carries ink. Turning the pen off keeps the ink drawn (inert: clicks
  // fall through to advance) until it is erased or the show ends (PPT-B018).
  const annotationLayer =
    onSelectAnnotationTool &&
    (annotationTool !== null || (annotationStrokes?.length ?? 0) > 0) ? (
      <PresentationAnnotationLayer
        tool={annotationTool}
        color={annotationColor}
        strokes={annotationStrokes ?? EMPTY_INK_STROKES}
        onStrokeStart={(point) => onAnnotationStrokeStart?.(point)}
        onStrokeAppend={(point) => onAnnotationStrokeAppend?.(point)}
        onStrokeFinish={() => onAnnotationStrokeFinish?.()}
        onErase={(point) => onAnnotationErase?.(point)}
        ariaLabel={t("presentation.annotationLayerLabel")}
      />
    ) : null;
  const wrapWithBackgroundAudio = (content: ReactNode) => (
    <PresentationShowMediaControlsContext.Provider value={showMediaControls}>
      <PresentationManagedBackgroundMediaContext.Provider
        value={managedBackgroundMediaIds}
      >
        <PresentationCarryAudioContext.Provider value={carryAudio}>
          {managedBackgroundAudios.map((spec) => (
            <PresentationBackgroundAudioPlayer key={spec.blockId} spec={spec} />
          ))}
          {transitionSoundPlay && transitionSoundSrc ? (
            <audio
              key={`presentation-transition-sound-${transitionSoundPlay.key}`}
              src={transitionSoundSrc}
              autoPlay
              hidden
              preload="auto"
              // It plays on across slides and holds none of them.
              data-playback-across="true"
              data-testid="presentation-present-transition-sound"
              onEnded={() => setTransitionSoundPlay((current) => (current?.key === transitionSoundPlay.key ? null : current))}
            />
          ) : null}
          {content}
        </PresentationCarryAudioContext.Provider>
      </PresentationManagedBackgroundMediaContext.Provider>
    </PresentationShowMediaControlsContext.Provider>
  );

  // The second-screen presenter window OWNS the console; while it is open this
  // overlay is forced onto the clean AUDIENCE layout regardless of the in-window
  // presenter toggle (so the projector/audience screen never shows notes).
  if (presenterView && !presenterWindowOpen) {
    return wrapWithBackgroundAudio(
      <div
        ref={overlayRef}
        className={`presentation-present presentation-present--presenter ${presentationChrome.presentShell}`}
        role="dialog"
        aria-modal="true"
        aria-label={t("presentation.presenterDialogLabel")}
        data-testid="presentation-present-overlay"
        data-presenter="true"
        tabIndex={-1}
      >
        <div
          className={presentationChrome.presentHeader}
          role="toolbar"
          aria-label={t("presentation.presentDialogLabel")}
        >
          <div className={presentationChrome.presentControls}>
            {rehearseToggle}
          </div>
          <div className={presentationChrome.presentControls}>
            {presenterToggle}
            {exitButton}
          </div>
        </div>
        {narrationPlayer}
        <div className="presentation-presenter">
          <div className="presentation-presenter__main">
            <div className="presentation-presenter__current">
              <span className="presentation-presenter__section-label">
                {t("presentation.presenterCurrent")}
              </span>
              <div
                className="presentation-presenter__stage"
                data-testid="presentation-presenter-current"
                // PowerPoint's presenter view: click (tap) the current slide
                
                onClick={annotationTool === null && onAdvance ? () => onAdvance("pointer") : undefined}
                {...swipeHandlers}
              >
                {/* Key only on the projected slide, as the audience stage
                    does: a new slide remounts (replaying its entrance), while
                    a same-slide build reveals its group in place, so the
                    slide's audio and video keep playing where they are
                    (PPT-B011). */}
                <PresentationSlideView
                  key={`presenter-current-${clampedIndex}-${presentVisit}`}
                  fitToParent
                  slide={presentingSlide}
                  slideNumber={presentingSlideNumber}
                  revealedGroups={showAnimations ? presentStep : undefined}
                  revealedSettled={presentStepSettled}
                  // Presenter view mirrors fired triggers (so the speaker sees the
                  // same revealed state) but passes NO fire handler — the speaker
                  // console's mini-stage isn't the audience click surface.
                  firedTriggers={showAnimations ? firedTriggers : undefined}
                  triggerReplays={showAnimations ? triggerReplays : undefined}
                  showAnimations={showAnimations}
                  theme={theme}
                  masters={masters}
                  slideIds={slideIds}
                  onNavigateToSlide={navigateToSlideById}
                  onClickAction={onClickAction}
                  transitionClassName={presentingTransitionClassName}
                  overlay={
                    annotationLayer ? (
                      <>
                        {presentingHeaderFooter}
                        {annotationLayer}
                      </>
                    ) : (
                      presentingHeaderFooter
                    )
                  }
                />
              </div>
              <div
                className="presentation-presenter__controls"
                data-testid="presentation-presenter-controls"
              >
                {onRetreat ? (
                  <button
                    type="button"
                    className="office-ribbon-control presentation-presenter__nav"
                    onClick={onRetreat}
                    title={t("presentation.presenterPrev")}
                    aria-label={t("presentation.presenterPrev")}
                    data-testid="presentation-presenter-previous"
                  >
                    <ChevronLeft size={22} aria-hidden="true" />
                  </button>
                ) : null}
                {annotationToolbar}
                {onAdvance ? (
                  <button
                    type="button"
                    className="office-ribbon-control presentation-presenter__nav"
                    onClick={() => onAdvance("control")}
                    title={t("presentation.presenterNextControl")}
                    aria-label={t("presentation.presenterNextControl")}
                    data-testid="presentation-presenter-next-button"
                  >
                    <ChevronRight size={22} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <aside className="presentation-presenter__aside">
            <div className="presentation-presenter__header">
              <span
                className="presentation-present__counter"
                aria-label={t("presentation.slideCounterLabel", counter)}
                data-testid="presentation-present-counter"
                data-current={counter.current}
                data-total={counter.total}
              >
                {t("presentation.slideCounter", counter)}
              </span>
              <div
                className="presentation-presenter__timer"
                data-testid="presentation-presenter-timer"
                data-running={timerRunning ? "true" : "false"}
              >
                <Timer size={14} aria-hidden="true" />
                <span
                  className="presentation-presenter__timer-value"
                  aria-label={t("presentation.elapsedLabel", {
                    elapsed: formatElapsed(elapsedMs),
                  })}
                  data-testid="presentation-presenter-elapsed"
                >
                  {formatElapsed(elapsedMs)}
                </span>
                {onToggleTimer ? (
                  <button
                    type="button"
                    className="presentation-presenter__timer-btn"
                    onClick={onToggleTimer}
                    title={
                      timerRunning
                        ? t("presentation.pauseTimer")
                        : t("presentation.resumeTimer")
                    }
                    aria-label={
                      timerRunning
                        ? t("presentation.pauseTimer")
                        : t("presentation.resumeTimer")
                    }
                    aria-pressed={!timerRunning}
                    data-testid="presentation-presenter-timer-toggle"
                  >
                    {timerRunning ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                ) : null}
                {onResetTimer ? (
                  <button
                    type="button"
                    className="presentation-presenter__timer-btn"
                    onClick={onResetTimer}
                    title={t("presentation.resetTimer")}
                    aria-label={t("presentation.resetTimer")}
                    data-testid="presentation-presenter-timer-reset"
                  >
                    <RotateCcw size={13} />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="presentation-presenter__next">
              <span className="presentation-presenter__section-label">
                {t("presentation.presenterNext")}
              </span>
              <div
                className="presentation-presenter__next-stage"
                data-testid="presentation-presenter-next"
                data-empty={nextSlide ? "false" : "true"}
              >
                {nextSlide ? (
                  // A preview, like a rail thumbnail: its audio and video are
                  // badges, so nothing of the next slide plays before the show
                  // reaches it (PPT-B010).
                  <PresentationSlideView
                    key={`presenter-next-${nextIndex}`}
                    fitToParent
                    slide={nextSlide}
                    theme={theme}
                    masters={masters}
                    staticMedia
                  />
                ) : (
                  <p className="presentation-presenter__next-end">
                    {t("presentation.presenterEnd")}
                  </p>
                )}
              </div>
            </div>
            <div
              className="presentation-present__notes presentation-presenter__notes"
              data-testid="presentation-present-notes"
            >
              <span className="presentation-present__notes-label">
                {t("presentation.speakerNotes")}
              </span>
              <p className="presentation-present__notes-body">
                {presentingSlide.notes?.trim()
                  ? presentingSlide.notes
                  : t("presentation.noNotes")}
              </p>
            </div>
          </aside>
        </div>
      </div>,
    );
  }

  return wrapWithBackgroundAudio(
    <div
      ref={overlayRef}
      className={`presentation-present ${presentationChrome.presentShell}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("presentation.presentDialogLabel")}
      data-testid="presentation-present-overlay"
      data-presenter="false"
      data-presenter-window={presenterWindowOpen ? "true" : "false"}
      data-show-type={showType}
      tabIndex={-1}
    >
      <div
        className={presentationChrome.presentHeader}
        data-testid="presentation-present-header"
        role="toolbar"
        aria-label={t("presentation.presentDialogLabel")}
      >
        <div className={presentationChrome.presentControls}>
          {onRetreat ? (
            <button
              className="office-ribbon-control"
              type="button"
              onClick={onRetreat}
              aria-label={t("presentation.presenterPrev")}
              data-testid="presentation-present-previous"
            >
              <ChevronLeft size={18} />
            </button>
          ) : null}
          <span
            className="presentation-present__counter"
            data-testid="presentation-present-counter"
            data-current={counter.current}
            data-total={counter.total}
            aria-label={t("presentation.slideCounterLabel", counter)}
          >
            {t("presentation.slideCounter", counter)}
          </span>
          {onAdvance ? (
            <button
              className="office-ribbon-control"
              type="button"
              onClick={() => onAdvance("control")}
              aria-label={t("presentation.presenterNextControl")}
              data-testid="presentation-present-next"
            >
              <ChevronRight size={18} />
            </button>
          ) : null}
        </div>
        <div className={presentationChrome.presentControls}>
          {rehearseToggle}
          {autoPlayToggle}
          {presenterToggle}
          {presenterWindowControl}
          {exitButton}
        </div>
      </div>
      {narrationPlayer}
      {/* Clicking the stage advances the timeline / slide, mirroring PowerPoint's
          click-to-advance. Buttons above stop propagation via their own onClick.
          While a draw tool is active the annotation layer consumes the click on
          the slide, so click-to-advance is suspended only over the slide itself. */}
      <div
        className="presentation-present__stage"
        // The event is not the source: passed as one, it slipped past On
        
        onClick={onAdvance ? () => onAdvance("pointer") : undefined}
        data-testid="presentation-present-stage"
        {...swipeHandlers}
      >
        {presentEnded ? (
          <div
            data-testid="presentation-present-end"
            role="status"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 5,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: 24,
              background: "#000",
              color: "#fff",
              fontSize: 16,
            }}
          >
            {t("presentation.presenterEnd")}
          </div>
        ) : null}
        {pushExit ? (
          <div
            key={`present-push-exit-${pushExit.key}`}
            className={`presentation-present__push-exit ${
              pushExit.direction === "hold"
                ? "presentation-present__slide--exit-hold"
                : `presentation-present__slide--exit-push-${pushExit.direction}`
            }`}
            style={{ animationDuration: `${pushExit.durationMs}ms` }}
            aria-hidden="true"
            data-testid="presentation-present-push-exit"
          >
            <PresentationSlideView
              fitToParent
              slide={pushExit.slide}
              showAnimations={false}
              // The slide as it was left: what its build brought in stays,
              // what it took away stays gone, nothing plays again.
              revealedGroups={pushExit.step}
              revealedSettled={pushExit.step !== undefined}
              staticMedia
              testId="presentation-present-slide-left"
              theme={theme}
              masters={masters}
              slideIds={slideIds}
            />
          </div>
        ) : null}
        {/* Key only on the projected slide. Newly revealed timeline blocks mount
            naturally as their group becomes visible, while the surrounding slide
            and an in-flight Morph overlay remain continuous across same-slide
            build advances. */}
        <PresentationSlideView
          key={`present-slide-${clampedIndex}-${presentVisit}`}
          fitToParent
          slide={presentingSlide}
          slideNumber={presentingSlideNumber}
          revealedGroups={showAnimations ? presentStep : undefined}
          revealedSettled={presentStepSettled}
          // Interactive triggers (audience layout only): the fired set reveals the
          // matching triggered steps, and a click on a trigger block fires it.
          // Rendered in place (no remount) so the newly-added entrance class plays
          // once without disturbing the auto sequence or a morph in flight.
          firedTriggers={showAnimations ? firedTriggers : undefined}
          triggerReplays={showAnimations ? triggerReplays : undefined}
          onFireTrigger={showAnimations ? onFireTrigger : undefined}
          showAnimations={showAnimations}
          theme={theme}
          masters={masters}
          slideIds={slideIds}
          onNavigateToSlide={navigateToSlideById}
          onClickAction={onClickAction}
          // A 3-D transition drawn to its end leaves the slide as it is: the
          // CSS one played after it, a second entrance (the slide turned
          // again once the canvas was gone).
          transitionClassName={glPlan !== null && glFellBack !== glPlan.key ? null : presentingTransitionClassName}
          entranceLeadMs={entranceLeadMs > 0 ? entranceLeadMs : undefined}
          captureFrameMs={capture?.frameMs}
          // While a morph tweens into this slide, hide its static content so the
          // morph layer is the only thing painting the (moving / fading) blocks.
          contentHidden={activeMorph !== null}
          // Overlays rendered INSIDE the slide box (which is `position: relative`)
          // so their geometry shares the slide's bounds:
          //  - the MORPH layer (a transient FLIP tween from the previous slide),
          //    keyed on the morph token so a rapid re-advance restarts FROM→TO; and
          //  - the ANNOTATION draw layer (laser dot + ink strokes), painted LAST so
          //    ink sits above both the slide content and any in-flight morph.
          overlay={
            activeMorph || annotationLayer || presentingHeaderFooter || glActive ? (
              <>
                {glActive && glPlan ? (
                  <PresentationGlTransition
                    key={`present-gl-${glPlan.key}`}
                    kind={glPlan.kind}
                    direction={glPlan.direction}
                    durationMs={glPlan.durationMs}
                    from={glPlan.from}
                    to={glPlan.to}
                    width={glPlan.to.width}
                    height={glPlan.to.height}
                    captured={capture !== undefined}
                    onDone={() => setGlEnded(glPlan.key)}
                    onUnavailable={() => {
                      setGlFellBack(glPlan.key);
                      setGlEnded(glPlan.key);
                    }}
                  />
                ) : null}
                {presentingHeaderFooter}
                {activeMorph ? (
                  <PresentationMorphLayer
                    key={`present-morph-${activeMorph.token}`}
                    spec={activeMorph}
                    theme={theme}
                    masters={masters}
                    onDone={settleMorph}
                    captured={capture !== undefined}
                  />
                ) : null}
                {annotationLayer}
              </>
            ) : null
          }
        />
      </div>
      <div className={`presentation-present__strip ${presentationChrome.presentFooter}`}>
        {annotationToolbar}
        {showType === "window" && resolvedShowScrollbar && onJumpToSlide ? (
          <input
            type="range"
            min={scrollStart}
            max={scrollEnd}
            value={Math.min(Math.max(clampedIndex, scrollStart), scrollEnd)}
            onChange={(event) => onJumpToSlide(Number(event.target.value))}
            aria-label={t("presentation.slideshow.showScrollbar")}
            data-testid="presentation-present-window-scrollbar"
          />
        ) : null}
      </div>
    </div>,
  );
}
