"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Reading View layer of the stage.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { PresentationSlideView } from "./PresentationSlideView";
import {
  PresentationHeaderFooterOverlay,
  presentationHeaderFooterPlacement,
} from "./PresentationHeaderFooterOverlay";
import { runSlideActionTarget, shownSlideActionIndex } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import { isSlideHidden } from "@mrnote/core/web/lib/presentation-slide-visibility.ts";
import { normalizePresentationClickAction } from "@mrnote/core/web/lib/presentation-block-fx.ts";
import { ChevronLeft, ChevronRight } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { PRESENTATION_RIBBON_LABELED_BUTTON_STYLE } from "../../../../lib/presentation/window-chrome-styles";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import type { SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { DeckHeaderFooter } from "@mrnote/core/web/lib/presentation-header-footer.ts";
import type { PresentationLiveView } from "../../../../lib/presentation/view-zoom";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationReadingViewLayerCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  slides: SlideModel[];
  theme: DeckTheme | undefined;
  masters: SlideMaster[];
  deckDateNow: Date;
  activeIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  slidesRef: RefObject<SlideModel[]>;
  activeIndexRef: RefObject<number>;
  activeSlide: SlideModel;
  activeSlideHeaderFooter: DeckHeaderFooter | undefined;
  dispatchPresentationView: (next: PresentationLiveView, options?: { trigger?: HTMLElement | null; restoreReadingFocus?: boolean; }) => boolean;
}

export function PresentationReadingViewLayer({ ctl }: { ctl: PresentationReadingViewLayerCtl }) {
  const {
    t,
    slides,
    theme,
    masters,
    deckDateNow,
    activeIndex,
    setActiveIndex,
    slidesRef,
    activeIndexRef,
    activeSlide,
    activeSlideHeaderFooter,
    dispatchPresentationView,
  } = ctl;
  return (
            <div
              data-presentation-view-layer="reading"
              className={presentationChrome.stageViewLayer}
              data-testid="presentation-reading-view"
              role="region"
              aria-label={t("presentation.view.reading")}
              tabIndex={-1}
            >
              <div className={`${presentationChrome.readingStage} office-page-enter`}>
                {/* Links inside the slide work here as in the show (PPT-B065):
                    a link to a slide opens it, even a hidden one it names,
                    and Next / Previous / First / Last actions move through
                    the deck. */}
                <PresentationSlideView
                  slide={activeSlide}
                  slideNumber={activeIndex + (activeSlideHeaderFooter?.firstSlideNumber ?? 1)}
                  theme={theme}
                  masters={masters}
                  overlay={
                    <PresentationHeaderFooterOverlay
                      resolved={activeSlideHeaderFooter}
                      deckIndex={activeIndex}
                      now={deckDateNow}
                      testIdPrefix="presentation-reading"
                      placement={presentationHeaderFooterPlacement(activeSlide, masters)}
                    />
                  }
                  slideIds={new Set(slides.map((slide) => slide.id))}
                  onNavigateToSlide={(slideId) => {
                    // A link's relative target (Next / Previous / First /
                    // Last Slide) resolves as the show resolves it, along
                    // the visible order (PPT-B290).
                    const live = slidesRef.current;
                    const current = activeIndexRef.current;
                    const relative = runSlideActionTarget(slideId);
                    const index = relative
                      ? shownSlideActionIndex(relative, current, live.length, (at) => isSlideHidden(live[at]))
                      : live.findIndex((slide) => slide.id === slideId);
                    if (index >= 0 && index !== current) {
                      activeIndexRef.current = index;
                      setActiveIndex(index);
                    }
                  }}
                  onClickAction={(value) => {
                    const action = normalizePresentationClickAction(value);
                    if (!action) return;
                    if (action.kind === "play-media") {
                      // The sound action plays its audio in Reading View as
                      // in the show: the media element of the target block
                      // on the page being read (PPT-B216).
                      const player = Array.from(
                        document.querySelectorAll<HTMLElement>(
                          '[data-testid="presentation-reading-view"] [data-presentation-block-id]',
                        ),
                      )
                        .find((element) => element.dataset.presentationBlockId === action.targetBlockId)
                        ?.querySelector<HTMLMediaElement>(action.mediaKind);
                      if (player) void player.play().catch(() => undefined);
                      return;
                    }
                    if (action.kind !== "relative-slide") return;
                    const live = slidesRef.current;
                    const current = activeIndexRef.current;
                    
                    // Reading View stepped onto hidden slides by number.
                    const target =
                      action.target === "previous" ||
                      action.target === "next" ||
                      action.target === "first" ||
                      action.target === "last"
                        ? shownSlideActionIndex(action.target, current, live.length, (at) =>
                            isSlideHidden(live[at]),
                          )
                        : -1;
                    if (target >= 0 && target < live.length) setActiveIndex(target);
                  }}
                />
              </div>
              {/* WPS's reading view keeps a status bar rather than a floating
              HUD: the deck is being read beside other windows, not projected. */}
              <div
                className={presentationChrome.readingBar}
                data-testid="presentation-reading-bar"
              >
                <button
                  type="button"
                  className="office-ribbon-control note-editor-office-toolbar__button" data-office-control-part="button"
                  disabled={activeIndex <= 0}
                  onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
                  aria-label={t("presentation.view.readingPrevious")}
                  data-testid="presentation-reading-prev"
                >
                  <ChevronLeft size={16} />
                </button>
                <span data-testid="presentation-reading-position">
                  {activeIndex + 1} / {slides.length}
                </span>
                <button
                  type="button"
                  className="office-ribbon-control note-editor-office-toolbar__button" data-office-control-part="button"
                  disabled={activeIndex >= slides.length - 1}
                  onClick={() =>
                    setActiveIndex(Math.min(slides.length - 1, activeIndex + 1))
                  }
                  aria-label={t("presentation.view.readingNext")}
                  data-testid="presentation-reading-next"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  className="office-ribbon-control note-editor-office-toolbar__button" data-office-control-part="button"
                  onClick={() =>
                    dispatchPresentationView("normal", {
                      restoreReadingFocus: true,
                    })
                  }
                  aria-label={t("presentation.view.readingExit")}
                  data-testid="presentation-reading-exit"
                  style={PRESENTATION_RIBBON_LABELED_BUTTON_STYLE}
                >
                  {t("presentation.view.readingNormal")}
                </button>
              </div>
            </div>
  );
}
