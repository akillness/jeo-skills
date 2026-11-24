"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The window status bar (slide counter, notes, comments, accessibility, views,
 * zoom).
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import {
  StickyNote,
  MessageSquare,
  LayoutGrid,
  Maximize2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { IconSlideShowFromCurrent } from "../PresentationRibbonIcons";
import { OfficeStatusProgress, type OfficeStatusPhase } from "@mrnote/core/web/components/office-ribbon/OfficeStatusBar.tsx";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { PresentationLiveView, PresentationViewportZoomMode } from "../../../../lib/presentation/view-zoom";
import { useDeferredValue, useMemo, type RefObject } from "react";
import { useQuietValue } from "@mrnote/core/web/hooks/useQuietValue.ts";

/** How long the deck must rest before the status bar reads it again. */
const STATUS_QUIET_MS = 400;
import { collectPresentationAccessibilityIssues } from "../../../../lib/presentation-a11y";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { SlideComment } from "@mrnote/core/web/lib/presentation-comments.ts";
import type { PresentationAccessibilityCheckCommandAuthority, PresentationViewportZoomCommandAuthority, ResolvedPresentationFeatureCommand } from "@mrnote/core/web/components/notebook/contents/ribbon/commandRegistry.ts";
import type { JSX } from "react/jsx-runtime";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationStatusBarCtl {
  pageId: string;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  /** The bar slides in from the bottom once (a draft just became this page). */
  chromeReveal?: boolean;
  slideZoomMode: PresentationViewportZoomMode;
  statusAccessibilityTriggerRef: RefObject<HTMLButtonElement | null>;
  slides: SlideModel[];
  activeIndex: number;
  presentMode: boolean;
  serverExportStatus: { readonly phase: OfficeStatusPhase; readonly format: string; readonly error?: string; } | null;
  statusReadingViewTriggerRef: RefObject<HTMLButtonElement | null>;
  activePresentationLiveView: PresentationLiveView | null;
  dispatchPresentationView: (next: PresentationLiveView, options?: { trigger?: HTMLElement | null; restoreReadingFocus?: boolean; }) => boolean;
  notesVisible: boolean;
  togglePresentationNotesPane: () => void;
  activeComments: SlideComment[];
  openCommentCount: number;
  commentsPanelOpen: boolean;
  commentsToggleRef: RefObject<HTMLButtonElement | null>;
  toggleReviewCommentsPane: () => void;
  accessibilityCheckCommandAuthority: PresentationAccessibilityCheckCommandAuthority;
  viewportZoomCommandAuthority: PresentationViewportZoomCommandAuthority;
  invokeAccessibilityCheck: (trigger: HTMLElement | null) => void;
  zoomFitToWindow: () => void;
  renderPresentationZoomDial: (testIdPrefix: string, menuSide?: "top" | "bottom", menuAlign?: "start" | "center" | "end", controlId?: string) => JSX.Element;
  featureDecision: (featureId: string) => ResolvedPresentationFeatureCommand;
  executePresentationFeature: (featureId: string) => undefined;
}

export function PresentationStatusBar({ ctl }: { ctl: PresentationStatusBarCtl }) {
  const {
    pageId,
    t,
    chromeReveal = false,
    slideZoomMode,
    statusAccessibilityTriggerRef,
    slides,
    activeIndex,
    presentMode,
    serverExportStatus,
    statusReadingViewTriggerRef,
    activePresentationLiveView,
    dispatchPresentationView,
    notesVisible,
    togglePresentationNotesPane,
    activeComments,
    openCommentCount,
    commentsPanelOpen,
    commentsToggleRef,
    toggleReviewCommentsPane,
    accessibilityCheckCommandAuthority,
    viewportZoomCommandAuthority,
    invokeAccessibilityCheck,
    zoomFitToWindow,
    renderPresentationZoomDial,
    featureDecision,
    executePresentationFeature,
  } = ctl;
  // The Accessibility word reads the same check the pane runs, off the
  // typing path: a deferred copy of the deck, re-rendering this bar alone.
  // It follows the deck once the typing pauses (useQuietValue).
  const deferredSlides = useQuietValue(useDeferredValue(slides), STATUS_QUIET_MS);
  const statusAccessibilityIssueCount = useMemo(
    () => collectPresentationAccessibilityIssues(deferredSlides).length,
    [deferredSlides],
  );
  return (
      <div
        className={presentationChrome.zoomStatusBar}
        role="toolbar"
        aria-label={`${t("presentation.view.presentationViewsGroup")}, ${t(
          "presentation.view.notes",
        )}, ${t(
          "presentation.slideshow.startGroup",
        )}, ${t(
          "presentation.view.zoomGroup",
        )}`}
        data-testid="presentation-status-bar"
        data-office-chrome-reveal={chromeReveal ? "bottom" : undefined}
        // The status bar is a ScreenTip region like the ribbon: its view,
        // notes and zoom buttons show the card (acceptance step 47).
        data-office-screen-tips="presentation"
      >
        {/* PowerPoint's status bar opens with "Slide X of Y". */}
        <span
          className={presentationChrome.statusSlideCounter}
          data-testid="presentation-status-slide-counter"
        >
          {t("presentation.slideCounterLabel", {
            current: activeIndex + 1,
            total: Math.max(1, slides.length),
          })}
        </span>
        {/* PowerPoint's status bar: "Accessibility: Good to go" or
            "Accessibility: Investigate" after the slide counter, opening the
            Accessibility checker (PPT-E010). */}
        <button
          ref={statusAccessibilityTriggerRef}
          type="button"
          className={presentationChrome.zoomStatusButton}
          data-control-id="PPTCTL.WINDOW.STATUS.ACCESSIBILITY"
          data-testid="presentation-status-accessibility"
          data-issues={statusAccessibilityIssueCount}
          disabled={presentMode || !accessibilityCheckCommandAuthority.isEnabled()}
          onClick={() =>
            invokeAccessibilityCheck(statusAccessibilityTriggerRef.current)
          }
          style={{ width: "auto", paddingInline: 6 }}
        >
          {t(
            statusAccessibilityIssueCount > 0
              ? "presentation.status.accessibilityInvestigate"
              : "presentation.status.accessibilityGood",
          )}
        </button>
        <div
          className={presentationChrome.sessionStatusGroup}
          role="group"
          aria-label={`${t("presentation.view.presentationViewsGroup")}, ${t(
            "presentation.view.notes",
          )}, ${t(
            "presentation.slideshow.startGroup",
          )}`}
        >
          <button
            type="button"
            className={presentationChrome.zoomStatusButton}
            data-control-id="PPTCTL.WINDOW.STATUS.NOTES"
            data-testid="presentation-status-notes"
            aria-label={
              notesVisible
                ? t("presentation.hideNotesLabel")
                : t("presentation.showNotesLabel")
            }
            aria-pressed={notesVisible}
            aria-expanded={notesVisible}
            aria-controls={`presentation-notes-${pageId}`}
            onClick={togglePresentationNotesPane}
          >
            <StickyNote size={14} aria-hidden="true" />
            <span className={presentationChrome.statusPaneLabel} aria-hidden="true">
              {t("presentation.view.notes")}
            </span>
          </button>
          <button
            ref={commentsToggleRef}
            type="button"
            className={presentationChrome.zoomStatusButton}
            data-control-id="PPTCTL.WINDOW.STATUS.COMMENTS"
            data-testid="presentation-comments-toggle"
            aria-label={
              commentsPanelOpen
                ? t("presentation.comments.hideLabel")
                : t("presentation.comments.showLabel")
            }
            aria-pressed={commentsPanelOpen}
            aria-expanded={commentsPanelOpen}
            aria-controls={`presentation-comments-${pageId}`}
            onClick={toggleReviewCommentsPane}
          >
            <MessageSquare size={14} aria-hidden="true" />
            <span className={presentationChrome.statusPaneLabel} aria-hidden="true">
              {t("presentation.comments.title")}
            </span>
            <span
              className="sr-only"
              data-testid="presentation-comments-count"
              data-open={openCommentCount}
              data-total={activeComments.length}
            >
              {t("presentation.comments.count", {
                open: openCommentCount,
                total: activeComments.length,
              })}
            </span>
          </button>
          <button
            type="button"
            className={presentationChrome.zoomStatusButton}
            data-control-id="PPTCTL.WINDOW.STATUS.VIEW.NORMAL"
            data-testid="presentation-status-view-normal"
            aria-label={t("presentation.view.normal")}
            aria-pressed={activePresentationLiveView === "normal"}
            disabled={presentMode}
            onClick={() => dispatchPresentationView("normal")}
          >
            <OfficeSemanticIcon semanticId="view.document" size={14} />
          </button>
          <button
            type="button"
            className={presentationChrome.zoomStatusButton}
            data-control-id="PPTCTL.WINDOW.STATUS.VIEW.SLIDE_SORTER"
            data-testid="presentation-status-view-sorter"
            aria-label={t("presentation.view.slideSorter")}
            aria-pressed={activePresentationLiveView === "sorter"}
            disabled={presentMode}
            onClick={() => dispatchPresentationView("sorter")}
          >
            <LayoutGrid size={14} aria-hidden="true" />
          </button>
          <button
            ref={statusReadingViewTriggerRef}
            type="button"
            className={presentationChrome.zoomStatusButton}
            data-control-id="PPTCTL.WINDOW.STATUS.VIEW.READING"
            data-testid="presentation-status-view-reading"
            aria-label={t("presentation.view.reading")}
            aria-pressed={activePresentationLiveView === "reading"}
            disabled={presentMode}
            onClick={() =>
              dispatchPresentationView("reading", {
                trigger: statusReadingViewTriggerRef.current,
              })
            }
          >
            <OfficeSemanticIcon semanticId="view.reading" size={14} />
          </button>
          <button
            type="button"
            className={presentationChrome.zoomStatusButton}
            data-control-id="PPTCTL.WINDOW.STATUS.VIEW.SLIDESHOW"
            data-testid="presentation-status-slideshow"
            aria-label={t("presentation.slideshow.fromCurrent")}
            disabled={!featureDecision("slideshow.fromCurrent").enabled}
            onClick={() =>
              executePresentationFeature("slideshow.fromCurrent")
            }
          >
            <IconSlideShowFromCurrent home size={14} />
          </button>
        </div>
        {serverExportStatus ? (
          <OfficeStatusProgress
            phase={serverExportStatus.phase}
            testId="presentation-export-status"
            data={{ "data-export-phase": serverExportStatus.phase }}
            title={serverExportStatus.error}
            transferName={t("toolbar.exportPreparing", { format: serverExportStatus.format })}
            label={
              <>
                {t(
                  serverExportStatus.phase === "preparing"
                    ? "toolbar.exportPreparing"
                    : serverExportStatus.phase === "ready"
                      ? "toolbar.exportReady"
                      : "toolbar.exportFailed",
                  { format: serverExportStatus.format },
                )}
                {serverExportStatus.phase === "failed" && serverExportStatus.error
                  ? ` — ${serverExportStatus.error}`
                  : null}
              </>
            }
          />
        ) : null}
        <div
          className={presentationChrome.zoomStatusControls}
          role="group"
          aria-label={t("presentation.view.zoomGroup")}
          data-testid="presentation-zoom-status"
        >
          {renderPresentationZoomDial(
            "presentation-status",
            "top",
            "end",
            "PPTCTL.WINDOW.STATUS.ZOOM.DIALOG_ENTRY",
          )}
          <button
            type="button"
            className={presentationChrome.zoomStatusButton}
            data-control-id="PPTCTL.WINDOW.STATUS.ZOOM.FIT"
            data-testid="presentation-zoom-status-fit"
            aria-label={t("presentation.view.fitToWindow")}
            aria-pressed={slideZoomMode === "fit"}
            disabled={!viewportZoomCommandAuthority.isEnabled()}
            onClick={zoomFitToWindow}
          >
            <Maximize2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
  );
}
