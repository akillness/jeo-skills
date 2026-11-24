"use client";















/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  captureElementPicture,
  ElementPictureError,
  nextFrame,
  type ElementPicture,
} from "@mrnote/core/web/lib/export/element-picture.ts";
import {
  officeFontFaceFamily,
  officeFontFaceRule,
  type OfficeFontFace,
} from "@mrnote/core/web/components/office-ribbon/officeFontFace.ts";
import type { DeckHeaderFooter } from "@mrnote/core/web/lib/presentation-header-footer.ts";
import type { SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import { slideBounds } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import { AUTOFIT_EMU_PER_PX } from "../../../../lib/presentation/text-layout-css";
import {
  PresentationHeaderFooterOverlay,
  presentationHeaderFooterPlacement,
  presentationSlideHeaderFooter,
} from "./PresentationHeaderFooterOverlay";
import { PresentationSlideView } from "./PresentationSlideView";

export interface PresentationSlidePictureDeck {
  readonly theme?: DeckTheme;
  readonly masters?: readonly SlideMaster[];
  readonly headerFooter?: DeckHeaderFooter;
  readonly fontFaces?: readonly OfficeFontFace[];
  readonly now: Date;
}

interface Job {
  readonly id: number;
  readonly slide: SlideModel;
  readonly deckIndex: number;
  readonly resolve: (picture: ElementPicture) => void;
  readonly reject: (error: unknown) => void;
  readonly signal?: AbortSignal;
}

/** How long a frame may take to settle before it is captured as it is. */
const SETTLE_MS = 6_000;
/** A frame is settled once nothing in it changed for this long. */
const QUIET_MS = 150;

async function frames(count: number): Promise<void> {
  // `nextFrame` also moves on when the window draws no frames (hidden or
  
  for (let left = count; left > 0; left -= 1) await nextFrame();
}

function within<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    work,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), Math.max(0, ms))),
  ]);
}

/** Pictures decoded, faces loaded and no change for {@link QUIET_MS}. */
async function settled(frame: HTMLElement): Promise<void> {
  const deadline = Date.now() + SETTLE_MS;
  await frames(2);
  await within(
    Promise.all(
      Array.from(frame.querySelectorAll("img")).map((image) =>
        image.complete ? undefined : image.decode().catch(() => undefined),
      ),
    ),
    deadline - Date.now(),
  );
  const fonts = frame.ownerDocument.fonts as FontFaceSet | undefined;
  if (fonts?.ready) await within(fonts.ready, deadline - Date.now());
  if (typeof MutationObserver === "undefined") return;
  await new Promise<void>((resolve) => {
    let timer = setTimeout(done, QUIET_MS);
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, Math.min(QUIET_MS, Math.max(0, deadline - Date.now())));
    });
    function done() {
      observer.disconnect();
      resolve();
    }
    observer.observe(frame, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
}

function deckFontRules(faces: readonly OfficeFontFace[] | undefined) {
  return (families: ReadonlySet<string>): string[] => {
    const rules: string[] = [];
    for (const face of faces ?? []) {
      const family = officeFontFaceFamily(face).trim().toLowerCase();
      if (!families.has(family)) continue;
      try {
        rules.push(officeFontFaceRule(face));
      } catch {
        // A document face whose bytes have not arrived is left to the stack.
      }
    }
    return rules;
  };
}

function SlidePictureFrame({
  job,
  deck,
  onDone,
}: {
  job: Job;
  deck: PresentationSlidePictureDeck;
  onDone: (id: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const bounds = slideBounds(job.slide);
  const width = Math.max(1, Math.round(bounds.width / AUTOFIT_EMU_PER_PX));
  const height = Math.max(1, Math.round(bounds.height / AUTOFIT_EMU_PER_PX));
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const frame = frameRef.current;
        if (!frame) throw new ElementPictureError("unavailable");
        await settled(frame);
        if (job.signal?.aborted) throw new ElementPictureError("aborted");
        const picture = await captureElementPicture(frame, {
          width,
          height,
          fontRules: deckFontRules(deck.fontFaces),
          signal: job.signal,
        });
        job.resolve(picture);
      } catch (error) {
        job.reject(error);
      } finally {
        if (live) onDone(job.id);
      }
    })();
    return () => {
      live = false;
    };
    // One capture per job: the job never changes under its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const resolved = presentationSlideHeaderFooter(
    deck.headerFooter,
    job.slide,
    deck.masters,
    deck.theme,
  );
  return (
    <div
      ref={frameRef}
      data-presentation-slide-picture={job.slide.id}
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        background: "#ffffff",
      }}
    >
      <PresentationSlideView
        slide={job.slide}
        theme={deck.theme}
        masters={deck.masters}
        staticMedia
        naturalSize
        showAnimations={false}
        slideNumber={job.deckIndex + (resolved?.firstSlideNumber ?? 1)}
        overlay={
          <PresentationHeaderFooterOverlay
            resolved={resolved}
            deckIndex={job.deckIndex}
            now={deck.now}
            testIdPrefix="presentation-picture"
            placement={presentationHeaderFooterPlacement(job.slide, deck.masters)}
          />
        }
      />
    </div>
  );
}

/**
 * `stage` must be rendered inside the presentation window (for its
 * stylesheets and contexts); `captureSlide` draws a slide there and resolves
 * with its picture, or rejects with an {@link ElementPictureError}.
 */
export function usePresentationSlidePictures(deck: PresentationSlidePictureDeck): {
  stage: ReactNode;
  captureSlide: (
    slide: SlideModel,
    deckIndex: number,
    signal?: AbortSignal,
  ) => Promise<ElementPicture>;
} {
  const [jobs, setJobs] = useState<readonly Job[]>([]);
  const nextId = useRef(0);
  const captureSlide = useCallback(
    (slide: SlideModel, deckIndex: number, signal?: AbortSignal) =>
      new Promise<ElementPicture>((resolve, reject) => {
        nextId.current += 1;
        const job: Job = { id: nextId.current, slide, deckIndex, resolve, reject, signal };
        setJobs((current) => [...current, job]);
      }),
    [],
  );
  const finish = useCallback((id: number) => {
    setJobs((current) => current.filter((job) => job.id !== id));
  }, []);
  // A window that closes with a picture pending answers it.
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  useEffect(
    () => () => {
      for (const job of jobsRef.current) job.reject(new ElementPictureError("aborted"));
    },
    [],
  );
  const stage = jobs.length ? (
    <div
      aria-hidden="true"
      inert
      data-presentation-picture-stage=""
      style={{
        position: "fixed",
        left: -100_000,
        top: 0,
        pointerEvents: "none",
        zIndex: -1,
      }}
    >
      {jobs.map((job) => (
        <SlidePictureFrame key={job.id} job={job} deck={deck} onDone={finish} />
      ))}
    </div>
  ) : null;
  return { stage, captureSlide };
}
