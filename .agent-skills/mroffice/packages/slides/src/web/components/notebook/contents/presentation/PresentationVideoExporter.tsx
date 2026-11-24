"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * File > Export > Create a Video / Create an Animated GIF (PowerPoint's,
 * Microsoft Support "Turn your presentation into a video", "Make an
 * animated GIF from a slide show").
 *
 * The show is played by its own overlay (`PresentationPresentOverlay`, in
 * capture mode) in a hidden frame the size of the file, and recorded frame by
 * frame on the recorder's clock (`lib/presentation-export-video/recorder`):
 * each slide's transition and the builds it starts by itself, then each
 * click's build in turn, then the slide held until it has been shown for the
 * time asked (`Seconds spent on each slide`, else its own recorded timing).
 * As in PowerPoint, the time asked is a floor -- builds that run longer keep
 * their length, a clip the show plays keeps the slide up until it has
 * played -- and the transition comes on top of it; hidden slides are left
 * out. The clips play in the file on the recording's own clock
 * (`export-media`), and each frame carries only the web faces its own text
 * is drawn in (`frame-fonts`).
 */

import { createContext as createScreenshotContext, destroyContext, domToForeignObjectSvg } from "modern-screenshot";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { DeckHeaderFooter } from "@mrnote/core/web/lib/presentation-header-footer.ts";
import type { SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import { partitionTimelineSteps, timelineClickCount } from "@mrnote/core/web/lib/presentation-anim-timeline.ts";
import {
  nativeTimingClickCount,
  nativeTimingInitialStep,
  slideNativeTimingTree,
} from "../../../../lib/presentation-native-timing-player";
import { slideBounds } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { isSlideHidden } from "@mrnote/core/web/lib/presentation-slide-visibility.ts";
import {
  isTransitionAdvanceAfterMs,
  normalizeSlideTransition,
  slideEntranceTransitionMs,
} from "@mrnote/core/web/lib/presentation-transitions.ts";
import { isGlTransitionKind } from "../../../../lib/presentation-gl-transitions";
import {
  clockEndedWithin,
  createEndlessClock,
  createGifSink,
  createMp4Sink,
  endlessAnimations,
  endlessFirstPassMs,
  finishAnimations,
  finiteRunningAnimations,
  GIF_FPS,
  pauseAnimations,
  seekAnimations,
  segmentLengthMs,
  stillUntilMs,
  VIDEO_FPS,
  type FrameSink,
  type VideoExportFormat,
} from "../../../../lib/presentation-export-video/recorder";
import {
  createFrameDrawer,
  keepDefaultStylesIntact,
  standardStyleProperties,
  type FrameDrawer,
} from "../../../../lib/presentation-export-video/frame-drawer";
import { createExportMediaClock, type ExportMediaClock } from "../../../../lib/presentation-export-video/export-media";
import { captureTransitionLeadMs } from "../../../../lib/presentation-export-video/capture-timing";
import {
  rehearsedClickDelaysMs,
  slideGroupBuildsMs,
  timedClickPlan,
} from "../../../../lib/presentation/slide-click-schedule";
import { makeExportAudio, type EncodedExportAudio } from "../../../../lib/presentation-export-video/export-audio";
import {
  createFrameFonts,
  FRAME_FONT_OPTION,
  type FrameFontContext,
  type FrameFonts,
} from "../../../../lib/presentation-export-video/frame-fonts";
import { MORPH_FRAME_EVENT } from "./PresentationMorphOutline";
import { PresentationPresentOverlay } from "./PresentationPresentOverlay";

export type VideoExportSettings = {
  readonly format: VideoExportFormat;
  /** The frame's height in pixels (the quality picked). */
  readonly height: number;
  /** Seconds spent on each slide (PowerPoint: 5 for a video, 1 for a GIF). */
  readonly secondsPerSlide: number;
  /** Use Recorded Timings: a slide's own After time where it has one. */
  readonly useRecordedTimings: boolean;
  /** Make background transparent (GIF). */
  readonly transparent: boolean;
  /** Slides from / to, 1-based in deck order; absent is the whole deck. */
  readonly fromSlide?: number;
  readonly toSlide?: number;
};

type Shown = { index: number; step: number; visit: number; settle: number };

/** The slides a recording plays, in order: in range and not hidden. */
export function videoExportSlideIndexes(slides: readonly SlideModel[], settings: VideoExportSettings): number[] {
  const first = Math.max(1, settings.fromSlide ?? 1);
  const last = Math.min(slides.length, settings.toSlide ?? slides.length);
  const indexes: number[] = [];
  for (let index = first - 1; index < last; index += 1) {
    if (!isSlideHidden(slides[index])) indexes.push(index);
  }
  return indexes;
}

/** The frame the file is drawn in: the slide's shape at the height asked, even sides. */
export function videoExportFrameSize(slides: readonly SlideModel[], height: number): { width: number; height: number } {
  const bounds = slideBounds(slides[0] as never);
  const evenHeight = Math.max(2, Math.round(height / 2) * 2);
  const width = Math.max(2, Math.round((evenHeight * bounds.width) / Math.max(1, bounds.height) / 2) * 2);
  return { width, height: evenHeight };
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** How long past the time asked a playing clip may keep its slide up. */
const MAX_CLIP_HOLD_MS = 30 * 60 * 1000;

export function PresentationVideoExporter({
  slides,
  theme,
  masters,
  headerFooter,
  deckSlideIds,
  settings,
  t,
  onProgress,
  onDone,
  onError,
  cancelRef,
  peekSlideTexture,
  prefetchSlideTextures,
}: {
  slides: SlideModel[];
  theme?: DeckTheme;
  masters?: readonly SlideMaster[];
  headerFooter?: DeckHeaderFooter;
  deckSlideIds?: readonly string[];
  settings: VideoExportSettings;
  t: (key: string, values?: Record<string, string | number>) => string;
  onProgress: (share: number) => void;
  onDone: (file: Blob) => void;
  onError: (error: Error) => void;
  /** Set to true to stop: the recording ends without a file. */
  cancelRef: { current: boolean };
  /** Pictures of slides for the transitions drawn in 3-D (as the show's). */
  peekSlideTexture?: (slide: SlideModel) => ImageBitmap | null;
  prefetchSlideTextures?: (slides: readonly SlideModel[]) => void;
}) {
  const frame = videoExportFrameSize(slides, settings.height);
  const indexes = videoExportSlideIndexes(slides, settings);
  const [shown, setShown] = useState<Shown | null>(() =>
    indexes.length > 0 ? { index: indexes[0]!, step: initialStep(slides[indexes[0]!]!), visit: 0, settle: 0 } : null,
  );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const committed = useRef<(() => void) | null>(null);
  const callbacks = useRef({ onProgress, onDone, onError });
  callbacks.current = { onProgress, onDone, onError };

  // Each `setShown` resolves once React has committed it.
  useLayoutEffect(() => {
    committed.current?.();
    committed.current = null;
  }, [shown]);

  // The show's clips play on the recording's clock, silent in the page
  // (`export-media`): each is taken in as the show mounts it.
  const clockRef = useRef<ExportMediaClock | null>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const clock = createExportMediaClock(host);
    clockRef.current = clock;
    clock.adopt();
    const observer = new MutationObserver(() => clock.adopt());
    observer.observe(host, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      clock.dispose();
      clockRef.current = null;
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let sink: FrameSink | null = null;
    let screenshot: Awaited<ReturnType<typeof createScreenshotContext>> | null = null;
    let drawer: FrameDrawer | null = null;
    const show = (next: Shown) =>
      new Promise<void>((resolve) => {
        committed.current = resolve;
        setShown(next);
      });
    const run = async () => {
      const host = hostRef.current;
      if (!host || indexes.length === 0) throw new Error("nothing-to-record");
      // The slides a 3-D transition joins are pictured first, so the file
      // has the transition the show has (up to half a minute's wait).
      if (peekSlideTexture && prefetchSlideTextures) {
        const needed: SlideModel[] = [];
        indexes.forEach((index, position) => {
          const slide = slides[index]!;
          const before = position > 0 ? slides[indexes[position - 1]!] : undefined;
          if (before && isGlTransitionKind(normalizeSlideTransition(slide.transition))) needed.push(before, slide);
        });
        if (needed.length > 0) {
          prefetchSlideTextures(needed);
          const until = Date.now() + 30_000;
          while (Date.now() < until && needed.some((slide) => !peekSlideTexture(slide))) {
            if (stopped || cancelRef.current) throw new Error("cancelled");
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
      }
      const fps = settings.format === "mp4" ? VIDEO_FPS : GIF_FPS;
      const step = 1000 / fps;
      sink = settings.format === "mp4"
        ? await createMp4Sink(frame.width, frame.height, fps)
        : createGifSink(frame.width, frame.height, settings.transparent);
      const clock = clockRef.current;
      if (!clock) throw new Error("nothing-to-record");
      let fonts: FrameFonts | null = null;
      screenshot = await createScreenshotContext(host, {
        width: frame.width,
        height: frame.height,
        backgroundColor: settings.format === "gif" && settings.transparent ? null : "#000000",
        autoDestruct: false,
        // Standard properties only, not the app's custom ones (`standardStyleProperties`).
        includeStyleProperties: standardStyleProperties(host.ownerDocument),
        // Each frame carries the faces of its own characters (`frame-fonts`),
        // set once the frame is cloned.
        font: { ...FRAME_FONT_OPTION },
        onCloneNode: () => fonts?.apply(),
        // A video is drawn by its frame's canvas (`export-media`).
        filter: (node) => !clock.leftOut(node),
        // The clone holds this instant's computed styles: nothing in it may
        // play on from its first keyframe.
        onCloneEachNode(cloned) {
          const style = (cloned as HTMLElement).style;
          if (style) {
            style.setProperty("animation", "none", "important");
            style.setProperty("transition", "none", "important");
          }
        },
      });
      fonts = createFrameFonts(screenshot as unknown as FrameFontContext);
      // Each element states what differs from its kind's default, not its
      // whole computed style (`keepDefaultStylesIntact`).
      keepDefaultStylesIntact(screenshot as unknown as Parameters<typeof keepDefaultStylesIntact>[0]);
      // One canvas and one picture for every frame, each frame's picture
      // let go as soon as it is drawn (`frame-drawer`): memory stays that of
      // one frame however long the recording.
      const context = screenshot;
      drawer = createFrameDrawer({
        width: frame.width,
        height: frame.height,
        background: settings.format === "gif" && settings.transparent ? null : "#000000",
        toSvg: () => domToForeignObjectSvg(context),
        context: context as unknown as Parameters<typeof createFrameDrawer>[0]["context"],
      });
      let endlessClock = 0;
      const endlessTime = createEndlessClock();
      const capture = async (durationMs: number) => {
        if (stopped || cancelRef.current) throw new Error("cancelled");
        // What draws itself from a clock (a Morph's outlines) draws this instant.
        window.dispatchEvent(new Event(MORPH_FRAME_EVENT));
        // Each clip where the recording's clock has it, its frame painted.
        await clock.sync();
        const canvas = await drawer!.draw();
        await sink!.addFrame(canvas, durationMs);
        clock.advance(durationMs);
      };
      const settleFrames = async () => {
        // The new slide's classes and the Morph layer's flip land a frame or two later.
        await nextFrame();
        await nextFrame();
        await nextFrame();
        // The faces its text is set in, loaded: a frame embeds the faces the
        // page has loaded (`frame-fonts`).
        await document.fonts?.ready;
      };
      const record = async (): Promise<number> => {
        await settleFrames();
        const finite = finiteRunningAnimations(host);
        const endless = endlessAnimations(host);
        pauseAnimations([...finite, ...endless]);
        // The group lasts until its last effect ends, a repeating one's first pass included.
        const length = Math.max(segmentLengthMs(finite), endlessFirstPassMs(endless));
        const frames = Math.max(1, Math.ceil(length / step));
        // What draws itself from its own clock (a Morph, a 3-D transition)
        // is drawn frame by frame.
        const selfDrawn = host.querySelector(".presentation-present__morph, [data-testid='presentation-gl-transition']") !== null;
        for (let index = 0; index < frames; ) {
          const at = index * step;
          seekAnimations(finite, at);
          endlessTime.seek(endless, endlessClock);
          // A stretch where nothing moves is one frame (`stillUntilMs`): not
          // while something loops or a video plays, nor on the frame a clock
          // ends (what it starts lands on the next).
          let run = 1;
          if (endless.length === 0 && !selfDrawn && !clock.playingVideo() && !clockEndedWithin(finite, at - step, at)) {
            const until = Math.min(length, stillUntilMs(finite, at));
            run = Math.min(frames - index, Math.max(1, Math.ceil(until / step - 1e-6) - index));
          }
          endlessClock += step * run;
          await capture(step * run);
          index += run;
        }
        finishAnimations(finite);
        return frames * step;
      };
      // A segment only where something has started to move.
      const recordMoving = async (): Promise<number> => {
        await settleFrames();
        return finiteRunningAnimations(host).length > 0 ? record() : 0;
      };
      // The slide held for the time asked, and for as long as a clip it
      // waits for still plays (PowerPoint: the slide is as long as its clip).
      // `waitForClips`: a clip the slide waits for keeps it up (its last hold);
      // a wait before a click does not wait for one.
      const hold = async (askedMs: number, waitForClips = true) => {
        const endless = endlessAnimations(host);
        pauseAnimations(endless);
        let held = 0;
        // However a clip reports itself, a slide is not held past this.
        const limit = Math.max(0, askedMs) + MAX_CLIP_HOLD_MS;
        while (held < limit) {
          await clock.sync();
          const clipLeft = waitForClips && clock.blocking() ? Math.max(clock.remainingMs(), step) : 0;
          const left = Math.min(limit - held, Math.max(askedMs - held, clipLeft));
          if (left <= 0) break;
          if (endless.length === 0 && !clock.playingVideo()) {
            // Nothing moves: one frame for all of it (a sound plays on).
            const still = clipLeft > 0 ? Math.min(left, Math.max(clipLeft, step)) : left;
            await capture(still);
            held += still;
            continue;
          }
          endlessTime.seek(endless, endlessClock);
          endlessClock += step;
          const piece = Math.min(step, left);
          await capture(piece);
          held += piece;
        }
      };
      let visit = 0;
      let settle = 0;
      for (let position = 0; position < indexes.length; position += 1) {
        const index = indexes[position]!;
        const slide = slides[index]!;
        const first = initialStep(slide);
        const tree = slideNativeTimingTree(slide);
        const groups = tree ? nativeTimingClickCount(tree) : timelineClickCount(slide.animationSequence ?? []);
        visit += 1;
        // Each slide's pictures are read for it and let go after it.
        (screenshot as unknown as { requests?: Map<string, unknown> }).requests?.clear();
        await show({ index, step: first, visit, settle });
        // The transition, with the builds the slide starts by itself.
        await settleFrames();
        const morphed = host.querySelector(".presentation-present__morph") !== null;
        const entered = await record();
        settle += 1;
        await show({ index, step: first, visit, settle });
        // The slide's timeline starts on the frame after its transition
        // (`captureTransitionLeadMs`, as the show's capture holds its builds).
        // A Morph keeps the slide's objects back until it settles: the builds
        // the slide starts by itself play then, after the whole Morph.
        const built = morphed
          ? await recordMoving()
          : Math.max(0, entered - captureTransitionLeadMs(slideEntranceTransitionMs(slide, position > 0), step));
        const advance = slide.transitionAdvanceAfterMs;
        const recorded = settings.useRecordedTimings && isTransitionAdvanceAfterMs(advance);
        const asked = recorded ? (advance as number) : settings.secondsPerSlide * 1000;
        // The clicks come by themselves (`timedClickPlan`): when the slide's
        // rehearsal says (Use Recorded Timings), else sharing what the builds
        // leave of the slide's time with its start.
        const clicks = groups - first;
        if (clicks <= 0) {
          await hold(Math.max(0, asked - built));
        } else {
          const plan = timedClickPlan({
            slideMs: asked,
            clicks,
            groupBuildsMs: slideGroupBuildsMs(slide),
            initialAuto: first > 0,
            rehearsed: recorded ? rehearsedClickDelaysMs(slide, clicks) : null,
          });
          // Time since the click before (the first: since the timeline began).
          let sinceClick = built;
          for (let click = 1; click <= clicks; click += 1) {
            const wait = Math.max(0, (plan.delaysMs[click - 1] ?? 0) - sinceClick);
            if (wait > 0) await hold(wait, false);
            await show({ index, step: first + click, visit, settle });
            sinceClick = await record();
          }
          await hold(Math.max(0, plan.afterLastMs - sinceClick));
        }
        callbacks.current.onProgress((position + 1) / indexes.length);
      }
      // The show's sound, mixed and encoded once the pictures are made
      // (`export-audio`); a video whose sound cannot be made keeps its pictures.
      let audio: EncodedExportAudio | null = null;
      if (settings.format === "mp4") {
        try {
          audio = await makeExportAudio(clock.heard(), clock.now, { cancelled: () => stopped || cancelRef.current });
        } catch (error) {
          if (error instanceof Error && error.message === "cancelled") throw error;
          audio = null;
        }
      }
      return sink.finish(audio);
    };
    run()
      .then((file) => {
        if (!stopped) callbacks.current.onDone(file);
      })
      .catch((error: unknown) => {
        sink?.abort();
        if (!stopped) callbacks.current.onError(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        drawer?.dispose();
        if (screenshot) destroyContext(screenshot);
      });
    return () => {
      stopped = true;
    };
    // One recording per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined" || !shown) return null;
  return createPortal(
    <div
      ref={hostRef}
      aria-hidden="true"
      inert
      data-testid="presentation-video-export"
      className={`presentation-video-export${settings.format === "gif" && settings.transparent ? " presentation-video-export--transparent" : ""}`}
      style={{ width: frame.width, height: frame.height }}
    >
      <PresentationPresentOverlay
        slides={slides}
        presentIndex={shown.index}
        presentStep={shown.step}
        presentStepSettled={false}
        // Use Recorded Timings and Narrations: a slide's narration is heard in the file.
        showNarrations={settings.useRecordedTimings}
        presentVisit={shown.visit}
        capture={{ settleToken: shown.settle, frameMs: 1000 / (settings.format === "mp4" ? VIDEO_FPS : GIF_FPS) }}
        peekSlideTexture={peekSlideTexture}
        prefetchSlideTextures={prefetchSlideTextures}
        headerFooter={headerFooter}
        deckSlideIds={deckSlideIds}
        theme={theme}
        masters={masters}
        overlayRef={overlayRef}
        onExit={() => {}}
        t={t}
      />
    </div>,
    document.body,
  );
}

/** The step a slide opens at: its first build is played with it when that starts by itself. */
function initialStep(slide: SlideModel): number {
  const tree = slideNativeTimingTree(slide);
  if (tree) return nativeTimingInitialStep(tree);
  const firstGroup = partitionTimelineSteps(slide.animationSequence ?? []).autoGroups[0];
  return firstGroup?.steps[0]?.trigger === "on-click" ? 0 : 1;
}
