"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The slide thumbnail rail (sections, slide tabs, insert gaps and the Outline
 * view in its place).
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { isDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import { reducedMotionNow } from "@mrnote/core/web/lib/reduce-motion.ts";
import { PresentationOutlineView } from "./PresentationOutlineView";
import { presentationOutlineProjection } from "../../../../lib/presentation-outline-view";
import { isTextEditLocked } from "@mrnote/core/web/lib/presentation-text-case.ts";
import { isSlideHidden } from "@mrnote/core/web/lib/presentation-slide-visibility.ts";
import { adjustParagraphLevelAt } from "@mrnote/core/web/lib/presentation-paragraphs.ts";
import { presentationListLevelRestyle } from "@mrnote/core/web/lib/presentation-level-styles.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { presentationSlideThumbnailName, SlideMiniThumbnail, RAIL_EAGER_MINIATURE_RADIUS } from "./PresentationSlideThumbnails";
import { LiveDraftUnitGhosts } from "@mrnote/core/web/components/notebook/live-draft/LiveDraftUnitGhosts.tsx";
import { slideBounds } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import {
  PresentationHeaderFooterOverlay,
  presentationSlideHeaderFooter,
} from "./PresentationHeaderFooterOverlay";
import type { DeckHeaderFooter } from "@mrnote/core/web/lib/presentation-header-footer.ts";
import {
  EyeOff,
  ChevronRight,
  ChevronDown,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { SECTION_NAME_MAX_LENGTH, type SectionGroup } from "@mrnote/core/web/lib/presentation-sections.ts";
import { nextSelection } from "../../../../lib/presentation-sorter";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { DeckTheme } from "@mrnote/core/web/lib/presentation-theme.ts";
import type { SlideMaster } from "@mrnote/core/web/lib/presentation-master.ts";
import type { embeddedPresentationAutosave } from "../../../../lib/presentation-embedded-session";
import type { PresentationCommandAdapter } from "@mrnote/core/web/lib/presentation-command-adapters.ts";
import type { TextEditSelection } from "@mrnote/core/web/lib/presentation-point-runs.ts";
import type { PresentationTextBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { PresentationSectionMenuState } from "./PresentationSectionMenuItems";
import { DeckPartStubSlide, type DeckStubState } from "./DeckPartStubSlide";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationThumbnailRailCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  /** A read-only preview: thumbnails only choose the slide on the stage (no
   * drag, insert gaps, section renames or deletes). */
  preview?: boolean;
  slides: SlideModel[];
  theme: DeckTheme | undefined;
  masters: SlideMaster[];
  collapsedSections: Set<string>;
  activeIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  slideRailMenu: { kind: "slide"; slideId: string; slideIds?: readonly string[]; x: number; y: number; } | { kind: "gap"; afterSlideId: string; x: number; y: number; } | null;
  retireBlockSelection: () => void;
  slidesRef: RefObject<SlideModel[]>;
  activeIndexRef: RefObject<number>;
  activateSlideFromRail: (index: number) => void;
  autosave: ReturnType<typeof embeddedPresentationAutosave>;
  activeSlide: SlideModel;
  slideIndexById: Map<string, number>;
  sectionGroups: SectionGroup<SlideModel>[];
  sectionNameDrafts: Readonly<Record<string, string>>;
  setSectionNameDrafts: Dispatch<SetStateAction<Readonly<Record<string, string>>>>;
  renameDeckSection: (sectionId: string, name: string) => void;
  removeDeckSection: (sectionId: string) => void;
  /** Which Section commands can run on a section (PowerPoint's rules). */
  sectionMenuState: (sectionId: string | null) => PresentationSectionMenuState;
  /** A section header's right-click menu, at the press. */
  openSectionHeaderMenu: (sectionId: string, clientX: number, clientY: number) => void;
  toggleSectionCollapsed: (sectionId: string) => void;
  viewMode: "rail" | "sorter" | "notes" | "reading" | "master";
  outlineView: boolean;
  setCommentsPanelOpen: Dispatch<SetStateAction<boolean>>;
  setCommentComposerOpen: Dispatch<SetStateAction<boolean>>;
  duplicateSlideCommand: PresentationCommandAdapter<"slides.duplicate">;
  selectSlideForRailCommand: (slideId: string) => number | null;
  copySlideToClipboard: (slideId: string) => boolean;
  cutSlideToClipboard: (slideId: string) => boolean;
  deleteSlideAtIndex: (index: number) => boolean;
  deleteSlidesByIds: (ids: readonly string[]) => boolean;
  pasteSlideAfter: (afterSlideId: string) => boolean;
  addSlideFromLayout: (layoutValue?: string, afterSlideId?: string) => void;
  openSlideRailContextMenu: (slideId: string, clientX: number, clientY: number, slideIds?: readonly string[]) => void;
  openSlideRailGapMenu: (afterSlideId: string, clientX: number, clientY: number) => void;
  setSlideRailViewport: Dispatch<SetStateAction<HTMLDivElement | null>>;
  updateTextBlock: (blockId: string, text: string, editSelection?: TextEditSelection, insertedLineBreaksAreSoft?: boolean,
    caretAfter?: number) => void;
  commitLiveTextBlockChange: (blockId: string, transform: (block: PresentationTextBlock, slide: SlideModel) => PresentationTextBlock | null) => boolean;
  railSlideEnters: (slideId: string) => boolean;
  /** The deck's Header & Footer and the date its fields read. */
  headerFooter?: DeckHeaderFooter;
  deckDateNow: Date;
  /** Review > Show Changes: the slides others changed since your last visit
   * (a dot by the thumbnail, E045); empty when it is off. */
  changedSlideIds?: ReadonlySet<string>;
  slideRailMenuCanOpenCommentComposer: boolean;
  /** The page an Agent run may be writing: its slides still to come stand
   * after the written ones as ghosts. */
  liveDraftPageId?: string | null;
  /** Told whether several slides are selected (Designer greys its button). */
  reportMultipleSlidesSelected?: (multiple: boolean) => void;
  /** A deck held as parts: what a slide whose part is not here yet shows
   * (lib/deck-page-parts), or null for a slide of its own. */
  deckStubState?: (slide: SlideModel) => DeckStubState | null;
  /** A deck held as parts: the copies a merge kept of slides someone else
   * changed too (this editor's version), marked until the deck reopens. */
  deckKeptCopies?: ReadonlySet<string>;
}









const RailSlideMiniature = memo(function RailSlideMiniature({
  slide,
  theme,
  masters,
  headerFooter,
  index,
  deckDateNow,
  eager,
}: {
  slide: SlideModel;
  theme: DeckTheme | undefined;
  masters: readonly SlideMaster[];
  headerFooter?: DeckHeaderFooter;
  index: number;
  deckDateNow: Date;
  eager: boolean;
}) {
  // PowerPoint's thumbnail shows the slide's footer, date and number as the
  // slide does.
  const overlay = useMemo(
    () =>
      headerFooter ? (
        <PresentationHeaderFooterOverlay
          resolved={presentationSlideHeaderFooter(headerFooter, slide, masters, theme)}
          deckIndex={index}
          now={deckDateNow}
          testIdPrefix="presentation-rail-thumb"
        />
      ) : undefined,
    [deckDateNow, headerFooter, index, masters, slide, theme],
  );
  return (
    <SlideMiniThumbnail
      slide={slide}
      theme={theme}
      masters={masters}
      overlay={overlay}
      slideNumber={index + (headerFooter?.firstSlideNumber ?? 1)}
      eager={eager}
      className="presentation-window__rail-mini-preview"
    />
  );
});

/** The rail's callbacks, read when a tile is pressed (the last committed
 * rail's), so a tile is drawn again only when what it shows changes. */
interface RailTileActions {
  pointerDown: () => void;
  click: (slide: SlideModel, index: number, event: ReactMouseEvent<HTMLButtonElement>) => void;
  contextMenu: (slide: SlideModel, event: ReactMouseEvent<HTMLButtonElement>) => void;
  keyDown: (slide: SlideModel, index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  gapMenu: (afterSlideId: string, clientX: number, clientY: number) => void;
}

/**
 * One slide of the thumbnail pane (its tile and the insert gap after it).
 * Memoized on what it shows: a long deck's rail was every tile's elements
 * reconciled again at every render of the window (a keystroke, a selection,
 * a slide change), the work growing with the deck.
 */
const RailSlideTile = memo(function RailSlideTile({
  t,
  slide,
  index,
  active,
  railMarked,
  enters,
  changed,
  stubState,
  keptCopy,
  eager,
  gapAfter,
  gapActive,
  theme,
  masters,
  headerFooter,
  deckDateNow,
  actions,
}: {
  t: PresentationThumbnailRailCtl["t"];
  slide: SlideModel;
  index: number;
  active: boolean;
  railMarked: boolean;
  enters: boolean;
  changed: boolean;
  stubState: DeckStubState | null;
  keptCopy: boolean;
  eager: boolean;
  gapAfter: boolean;
  gapActive: boolean;
  theme: DeckTheme | undefined;
  masters: readonly SlideMaster[];
  headerFooter?: DeckHeaderFooter;
  deckDateNow: Date;
  actions: RefObject<RailTileActions>;
}) {
  return (
    <Fragment>
    <button
      type="button"
      className={[
        active ? "is-active" : "",
        isSlideHidden(slide)
          ? "presentation-window__rail-slide--hidden"
          : "",
        enters ? "office-page-enter" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      // A new thumbnail enters at once, not on the page
      // stagger its place in the rail would give it.
      style={
        enters
          ? { animationDelay: "0ms" }
          : undefined
      }
      data-slide-id={slide.id}
      data-slide-number={index + 1}
      onPointerDown={() => actions.current.pointerDown()}
      onClick={(event) => actions.current.click(slide, index, event)}
      onContextMenu={(event) => actions.current.contextMenu(slide, event)}
      onKeyDown={(event) => actions.current.keyDown(slide, index, event)}
      data-testid="presentation-slide-tab"
      aria-label={presentationSlideThumbnailName(index, slide.title, t)}
      // Which slide you are on was carried ONLY by a CSS class,
      // so assistive technology could not tell: every tile in
      // the rail read the same. `aria-current="true"` is what a
      // screen reader announces as "current" — the same signal
      // PowerPoint and WPS expose for the thumbnail pane.
      aria-current={active ? "true" : undefined}
      data-rail-selected={
        railMarked ? "true" : undefined
      }
      data-hidden={isSlideHidden(slide) ? "true" : undefined}
      data-slide-changed={changed ? "true" : undefined}
      data-deck-stub={stubState ? "true" : undefined}
      // Reordered by the shared pointer path (mouse and
      // finger, PresentationWindow's useTouchReorder), not
      // HTML5 drag: Safari's native drag could stay stuck to
      // the pointer after a press re-rendered the rail.
      draggable={false}
    >
      {/* Real miniature render from the presentation renderer. The
    legacy rail-mini-preview class keeps the shell's
    active-slide border + hover chrome applying. */}
      {stubState ? (
        // A slide whose part is still on its way: its
        // frame, saying so (lib/deck-page-parts).
        <span style={{ position: "relative", display: "block" }}>
          <RailSlideMiniature
        slide={slide}
        theme={theme}
        masters={masters}
        headerFooter={headerFooter}
        index={index}
        deckDateNow={deckDateNow}
        eager={eager}
      />
          <DeckPartStubSlide t={t} ordinal={index + 1} state={stubState} size="mini" />
        </span>
      ) : (
        <RailSlideMiniature
        slide={slide}
        theme={theme}
        masters={masters}
        headerFooter={headerFooter}
        index={index}
        deckDateNow={deckDateNow}
        eager={eager}
      />
      )}
      {/* No title row under the miniature (PowerPoint draws
        none; the number sits beside it). A hidden slide
        still says so. */}
      {keptCopy ? (
        <span className="presentation-window__rail-slide-label">
          <span
            className="presentation-window__rail-hidden-badge"
            data-testid="presentation-slide-kept-copy-badge"
            title={t("presentation.deckParts.keptCopyTitle")}
          >
            {t("presentation.deckParts.keptCopyBadge")}
          </span>
        </span>
      ) : null}
      {isSlideHidden(slide) ? (
        <span className="presentation-window__rail-slide-label">
          <span
            className="presentation-window__rail-hidden-badge"
            data-testid="presentation-slide-hidden-badge"
            title={t("presentation.slideHiddenBadge")}
          >
            <EyeOff size={11} aria-hidden="true" />
            {t("presentation.slideHiddenBadge")}
          </span>
        </span>
      ) : null}
    </button>
    {gapAfter ? (
      <div
        className={presentationChrome.slideInsertGap}
        role="button"
        tabIndex={0}
        aria-label={`${t("presentation.addSlide")} ${index + 1}–${index + 2}`}
        data-testid="presentation-slide-insert-gap"
        data-after-slide-id={slide.id}
        data-active={gapActive ? "true" : undefined}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          actions.current.gapMenu(
            slide.id,
            event.clientX,
            event.clientY,
          );
        }}
        // A right click between two slides offers New Slide /
        // Paste / Add Section there, as PowerPoint's does; a
        // finger reaches it by a long press (the shared
        // press-and-hold right click) or a double tap.
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          actions.current.gapMenu(slide.id, event.clientX, event.clientY);
        }}
        onClick={(event) => {
          if (!isDoubleTap(event.nativeEvent, `gap:${slide.id}`)) return;
          event.stopPropagation();
          actions.current.gapMenu(slide.id, event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (
            event.key !== "Enter" &&
            event.key !== " " &&
            event.key !== "ContextMenu" &&
            !(event.key === "F10" && event.shiftKey)
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          actions.current.gapMenu(
            slide.id,
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
        }}
      >
        <span aria-hidden="true" />
      </div>
    ) : null}
    </Fragment>
  );
});

export function PresentationThumbnailRail({ ctl }: { ctl: PresentationThumbnailRailCtl }) {
  const {
    t,
    preview = false,
    slides,
    theme,
    masters,
    collapsedSections,
    activeIndex,
    setActiveIndex,
    slideRailMenu,
    retireBlockSelection,
    slidesRef,
    activeIndexRef,
    activateSlideFromRail,
    autosave,
    activeSlide,
    slideIndexById,
    sectionGroups,
    sectionNameDrafts,
    setSectionNameDrafts,
    renameDeckSection,
    removeDeckSection,
    sectionMenuState,
    openSectionHeaderMenu,
    toggleSectionCollapsed,
    viewMode,
    outlineView,
    setCommentsPanelOpen,
    setCommentComposerOpen,
    duplicateSlideCommand,
    selectSlideForRailCommand,
    copySlideToClipboard,
    cutSlideToClipboard,
    deleteSlideAtIndex,
    deleteSlidesByIds,
    pasteSlideAfter,
    addSlideFromLayout,
    openSlideRailContextMenu,
    openSlideRailGapMenu,
    setSlideRailViewport,
    updateTextBlock,
    commitLiveTextBlockChange,
    railSlideEnters,
    slideRailMenuCanOpenCommentComposer,
    headerFooter,
    deckDateNow,
  } = ctl;
  // The thumbnail pane keeps the keyboard on the current slide, as
  // PowerPoint's does: a click focuses the thumbnail (Safari does not focus
  // a clicked button), focus follows the slide the arrows, Page Down or Undo
  // make current, and a thumbnail that Delete, Cut or Undo removes hands
  // focus to the slide in its place, so the next shortcut still reaches the
  // pane.
  const railRef = useRef<HTMLElement | null>(null);
  const railOwnsFocusRef = useRef(false);
  // Several slides at once, as PowerPoint's thumbnail pane (and the Slide
  // Sorter here) select them: Shift+click or Shift+Up/Down a range,
  // Ctrl/Cmd+click one more, Ctrl/Cmd+A all. Delete and the slide menu's
  // Duplicate and Delete then act on all of them.
  const [railSelection, setRailSelection] = useState<{
    selected: ReadonlySet<string>;
    anchor: string | null;
  }>({ selected: new Set(), anchor: null });
  const slideOrder = slides.map((slide) => slide.id);
  const railSelected = new Set(
    [...railSelection.selected].filter((id) => slideOrder.includes(id)),
  );
  const multiSelected = railSelected.size > 1 && railSelected.has(activeSlide.id);
  const reportMultipleSlidesSelected = ctl.reportMultipleSlidesSelected;
  useEffect(() => {
    reportMultipleSlidesSelected?.(multiSelected);
  }, [multiSelected, reportMultipleSlidesSelected]);
  // The current slide changed from elsewhere (a click on the canvas's slide,
  // Page Down, Undo): the range ends there.
  useEffect(() => {
    setRailSelection((current) =>
      current.selected.has(activeSlide.id)
        ? current
        : { selected: new Set([activeSlide.id]), anchor: activeSlide.id },
    );
  }, [activeSlide.id]);
  const selectRailSlides = (ids: readonly string[], anchor: string | null) =>
    setRailSelection({ selected: new Set(ids), anchor });
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !railOwnsFocusRef.current) return;
    const focused = document.activeElement;
    const lost =
      !focused || focused === document.body || !focused.isConnected;
    const onThumbnail =
      focused instanceof HTMLElement &&
      rail.contains(focused) &&
      focused.matches('[data-testid="presentation-slide-tab"]');
    if (!lost && !onThumbnail) {
      railOwnsFocusRef.current = false;
      return;
    }
    const target = [
      ...rail.querySelectorAll<HTMLElement>('[data-testid="presentation-slide-tab"]'),
    ].find((thumbnail) => thumbnail.dataset.slideId === activeSlide.id);
    // The browser's own scroll-into-view on focus is instant; the effect
    // below brings the thumbnail into view and glides there, so Down at the
    // bottom of the pane no longer jumps a whole tile.
    if (target && target !== focused) target.focus({ preventScroll: true });
  }, [activeSlide.id, slides]);
  // The current slide's thumbnail stays in view however the slide became
  // current -- a comment's Next, Find, Page Down on the stage -- as
  // PowerPoint's thumbnail pane follows the slide shown. The pane kept its
  // scroll, and Next Comment to slide 1 left slide 1's thumbnail above the
  
  useEffect(() => {
    const viewport = railRef.current?.querySelector<HTMLElement>(
      '[data-testid="presentation-rail-viewport"]',
    );
    if (!viewport) return;
    const target = [
      ...viewport.querySelectorAll<HTMLElement>('[data-testid="presentation-slide-tab"]'),
    ].find((thumbnail) => thumbnail.dataset.slideId === activeSlide.id);
    if (!target) return;
    const view = viewport.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    if (view.height <= 0 || box.height <= 0) return;
    const margin = 4;
    let delta = 0;
    if (box.top < view.top) {
      delta = -(view.top - box.top + margin);
    } else if (box.bottom > view.bottom) {
      delta = Math.min(box.bottom - view.bottom + margin, box.top - view.top - margin);
    }
    if (delta === 0) return;
    // Measured against where the pane is now, so a held arrow key retargets
    // a glide already under way instead of stacking on its end point.
    const top = viewport.scrollTop + delta;
    if (typeof viewport.scrollTo === "function" && !reducedMotionNow()) {
      viewport.scrollTo({ top, behavior: "smooth" });
    } else {
      viewport.scrollTop = top;
    }
  }, [activeSlide.id]);
  const tileActions: RailTileActions = {
    pointerDown: () => retireBlockSelection(),
    click: (slide, index, event) => {
      // Safari's mouse down focuses the window around a
      // clicked button, not the button.
      event.currentTarget.focus({ preventScroll: true });
      const next = nextSelection(
        slideOrder,
        railSelected.size > 0 ? railSelected : new Set([activeSlide.id]),
        slide.id,
        {
          shift: event.shiftKey,
          meta: event.metaKey || event.ctrlKey,
        },
        railSelection.anchor ?? activeSlide.id,
      );
      if (next.selected.size === 0) return;
      setRailSelection(next);
      if (next.selected.has(slide.id)) {
        activateSlideFromRail(index);
      } else {
        const keep = slideOrder.findIndex((id) => next.selected.has(id));
        if (keep >= 0) activateSlideFromRail(keep);
      }
    },
    contextMenu: (slide, event) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      openSlideRailContextMenu(
        slide.id,
        event.clientX,
        event.clientY,
        multiSelected && railSelected.has(slide.id)
          ? slideOrder.filter((id) => railSelected.has(id))
          : undefined,
      );
    },
    keyDown: (slide, index, event) => {
      if (
        event.key === "ContextMenu" ||
        (event.key === "F10" && event.shiftKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        openSlideRailContextMenu(
          slide.id,
          rect.left + Math.min(rect.width, 28),
          rect.top + Math.min(rect.height, 28),
        );
        return;
      }
      const commandModifier = event.metaKey || event.ctrlKey;
      if (
        commandModifier &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "a"
      ) {
        // Ctrl/Cmd+A in the thumbnail pane selects every
        // slide (Microsoft's shortcut list).
        event.preventDefault();
        event.stopPropagation();
        selectRailSlides(slideOrder, activeSlide.id);
        return;
      }
      if (commandModifier && !event.altKey) {
        const key = event.key.toLowerCase();
        if (
          ["c", "x", "v", "d"].includes(key) ||
          (key === "m" &&
            event.shiftKey &&
            slideRailMenuCanOpenCommentComposer)
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (key === "c") copySlideToClipboard(slide.id);
          else if (key === "x")
            cutSlideToClipboard(slide.id);
          else if (key === "v") pasteSlideAfter(slide.id);
          else if (key === "d") {
            if (selectSlideForRailCommand(slide.id) !== null) {
              duplicateSlideCommand.execute();
            }
          } else if (key === "m" && event.shiftKey) {
            selectSlideForRailCommand(slide.id);
            setCommentsPanelOpen(true);
            setCommentComposerOpen(true);
          }
          return;
        }
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateSlideFromRail(index);
        return;
      }
      // Escape lets go of a several-slide selection,
      // keeping the current slide.
      if (event.key === "Escape" && multiSelected) {
        event.preventDefault();
        event.stopPropagation();
        selectRailSlides([activeSlide.id], activeSlide.id);
        return;
      }
      // Shift+Up / Shift+Down widen the range from its
      // anchor, as Shift+click does.
      if (
        !commandModifier &&
        !event.altKey &&
        event.shiftKey &&
        (event.key === "ArrowDown" || event.key === "ArrowUp")
      ) {
        event.preventDefault();
        const current = slideOrder.indexOf(slide.id);
        const target = current + (event.key === "ArrowDown" ? 1 : -1);
        if (current < 0 || target < 0 || target >= slideOrder.length) return;
        const anchor = railSelection.anchor ?? activeSlide.id;
        const next = nextSelection(
          slideOrder,
          railSelected,
          slideOrder[target],
          { shift: true },
          anchor,
        );
        setRailSelection(next);
        activateSlideFromRail(target);
        return;
      }
      // Up / Down move through the slides, Home / End
      // to the first and last, as PowerPoint's
      // thumbnail pane does.
      if (
        !commandModifier &&
        !event.altKey &&
        !event.shiftKey &&
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
      ) {
        event.preventDefault();
        const count = slidesRef.current.length;
        const current = slidesRef.current.findIndex(
          (candidate) => candidate.id === slide.id,
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : current + (event.key === "ArrowDown" ? 1 : -1);
        if (current < 0 || next < 0 || next >= count) return;
        const nextId = slidesRef.current[next]?.id;
        if (nextId) selectRailSlides([nextId], nextId);
        activateSlideFromRail(next);
        return;
      }
      // PowerPoint for the web: Delete on the selected
      // thumbnail deletes the slide (PPT-B420). The last
      // slide stays, as the menu's Delete Slide greys.
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !commandModifier &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (autosave.readOnly || slidesRef.current.length <= 1) return;
        if (multiSelected && railSelected.has(slide.id)) {
          // Every selected slide, one Undo; the deck keeps
          // one slide, as the last slide's Delete greys.
          if (railSelected.size >= slidesRef.current.length) return;
          retireBlockSelection();
          deleteSlidesByIds(slideOrder.filter((id) => railSelected.has(id)));
          return;
        }
        const liveIndex = slidesRef.current.findIndex(
          (candidate) => candidate.id === slide.id,
        );
        if (liveIndex < 0) return;
        retireBlockSelection();
        deleteSlideAtIndex(liveIndex);
      }
    },
    gapMenu: (afterSlideId, clientX, clientY) => openSlideRailGapMenu(afterSlideId, clientX, clientY),
  };
  const tileActionsRef = useRef<RailTileActions>(tileActions);
  useLayoutEffect(() => {
    tileActionsRef.current = tileActions;
  });
  return (
        <aside
          ref={railRef}
          className={`presentation-window__rail ${presentationChrome.slideRail}`}
          aria-label={t("presentation.sorter.viewRail")}
          data-view-mode={viewMode}
          onFocus={(event) => {
            railOwnsFocusRef.current =
              event.target instanceof HTMLElement &&
              event.target.matches('[data-testid="presentation-slide-tab"]');
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) return;
            if (next) {
              railOwnsFocusRef.current = false;
              return;
            }
            // Focus that left for nowhere while the thumbnail stays is the
            // person leaving the pane; a removed thumbnail is not.
            const from = event.target;
            requestAnimationFrame(() => {
              if (from.isConnected) railOwnsFocusRef.current = false;
            });
          }}
          // Slide Sorter takes the thumbnail pane's place as well (PPT-E011).
          style={viewMode === "sorter" ? { display: "none" } : undefined}
        >
          {outlineView && viewMode === "rail" ? (
            <PresentationOutlineView
              slides={slides.map((slide, index) => {
                const projection = presentationOutlineProjection(slide);
                const titleBlock = projection.titleBlockId
                  ? slide.blocks.find((block) => block.id === projection.titleBlockId)
                  : undefined;
                const bodyBlock = projection.bodyBlockId
                  ? slide.blocks.find((block) => block.id === projection.bodyBlockId)
                  : undefined;
                return {
                  id: slide.id,
                  number: index + 1,
                  title: projection.title,
                  titleEditable: Boolean(titleBlock && !isTextEditLocked(titleBlock)),
                  lines: projection.lines.map((line, lineIndex) => ({
                    key: `${projection.bodyBlockId}:${lineIndex}`,
                    ...line,
                  })),
                  bodyEditable: Boolean(bodyBlock && !isTextEditLocked(bodyBlock)),
                  levelsEditable:
                    Boolean(bodyBlock && !isTextEditLocked(bodyBlock)) &&
                    projection.bodyHasParagraphs,
                  hasGraphics: projection.hasGraphics,
                  hidden: isSlideHidden(slide),
                };
              })}
              activeId={activeSlide?.id ?? null}
              readOnly={autosave.readOnly || preview}
              labels={{
                region: t("presentation.view.outline"),
                untitled: t("presentation.untitledSlide"),
                slide: (number) => t("presentation.actionSettings.slideLabel", { number }),
              }}
              onActivate={(slideId) => {
                const index = slidesRef.current.findIndex((slide) => slide.id === slideId);
                if (index >= 0 && index !== activeIndexRef.current) {
                  activeIndexRef.current = index;
                  setActiveIndex(index);
                }
              }}
              onTitleChange={(slideId, text, caretAfter) => {
                const slide = slidesRef.current.find((candidate) => candidate.id === slideId);
                const titleId = slide ? presentationOutlineProjection(slide).titleBlockId : null;
                if (titleId) updateTextBlock(titleId, text, undefined, false, caretAfter);
              }}
              onBodyChange={(slideId, lines, caretAfter) => {
                const slide = slidesRef.current.find((candidate) => candidate.id === slideId);
                const bodyId = slide ? presentationOutlineProjection(slide).bodyBlockId : null;
                if (bodyId) updateTextBlock(bodyId, lines.join("\n"), undefined, false, caretAfter);
              }}
              onLevelChange={(slideId, lineIndex, delta) => {
                const slide = slidesRef.current.find((candidate) => candidate.id === slideId);
                const bodyId = slide ? presentationOutlineProjection(slide).bodyBlockId : null;
                if (!bodyId) return;
                commitLiveTextBlockChange(bodyId, (block) => {
                  if (!Array.isArray(block.paragraphs) || block.paragraphs.length === 0) {
                    return null;
                  }
                  const next = adjustParagraphLevelAt(
                    block.paragraphs as Parameters<typeof adjustParagraphLevelAt>[0],
                    lineIndex,
                    delta,
                    // An imported body's words re-inherit at the new level (PPTX §13).
                    presentationListLevelRestyle(block),
                  ) as typeof block.paragraphs;
                  return next === block.paragraphs ? null : { ...block, paragraphs: next };
                });
              }}
              onNewSlideAfter={(slideId) => {
                const before = slidesRef.current.length;
                addSlideFromLayout("title-content", slideId);
                if (slidesRef.current.length === before) return null;
                return slidesRef.current[activeIndexRef.current]?.id ?? null;
              }}
              onContextMenu={openSlideRailContextMenu}
            />
          ) : null}
          <div
            ref={setSlideRailViewport}
            className={presentationChrome.railViewport}
            data-testid="presentation-rail-viewport"
            // A pointer on a slide another member shows is drawn on its
            // thumbnail here (lib/collaboration-windows/pointer-anchor).
            data-collab-pointer-surface=".presentation-window__rail-mini-preview"
            data-collab-pointer-number="data-slide-number"
            style={outlineView && viewMode === "rail" ? { display: "none" } : undefined}
            // The thumbnail pane's empty area answers a right click with New
            // Slide / Paste / Add Section after the last slide (PPT-C016).
            onContextMenu={(event) => {
              if (event.target !== event.currentTarget) return;
              const last = slidesRef.current[slidesRef.current.length - 1];
              if (!last) return;
              event.preventDefault();
              openSlideRailGapMenu(last.id, event.clientX, event.clientY);
            }}
          >
                {/* Section-grouped slide thumbnails. The leading default group
              (`section: null`) has no header; every other group renders a
              collapsible header (rename + delete). Slide buttons keep their flat
              index-based selection / drag logic via `slideIndexById`. */}
                {sectionGroups.map((group) => {
                  const section = group.section;
                  const collapsed = section
                    ? collapsedSections.has(section.id)
                    : false;
                  const renderSlideButton = (slide: SlideModel) => {
                    const index = slideIndexById.get(slide.id) ?? 0;
                    const stubState = slide.importPending ? (ctl.deckStubState?.(slide) ?? "pending") : null;
                    return (
                      <RailSlideTile
                        key={slide.id}
                        t={t}
                        slide={slide}
                        index={index}
                        active={index === activeIndex}
                        railMarked={multiSelected && railSelected.has(slide.id)}
                        enters={railSlideEnters(slide.id)}
                        changed={Boolean(ctl.changedSlideIds?.has(slide.id))}
                        stubState={stubState}
                        keptCopy={Boolean(ctl.deckKeptCopies?.has(slide.id))}
                        eager={Math.abs(index - activeIndex) <= RAIL_EAGER_MINIATURE_RADIUS}
                        gapAfter={index < slides.length - 1 && !preview}
                        gapActive={slideRailMenu?.kind === "gap" && slideRailMenu.afterSlideId === slide.id}
                        theme={theme}
                        masters={masters}
                        headerFooter={headerFooter}
                        deckDateNow={deckDateNow}
                        actions={tileActionsRef}
                      />
                    );
                  };
                  return (
                    <div
                      key={
                        section ? `section-${section.id}` : "section-default"
                      }
                      className="presentation-window__rail-section"
                      data-testid={
                        section
                          ? `presentation-rail-section-${section.id}`
                          : "presentation-rail-section-default"
                      }
                    >
                      {section ? (
                        <div
                          className="presentation-window__rail-section-header"
                          data-testid="presentation-rail-section-header"
                          // PowerPoint's section menu: Rename, Remove, Remove
                          // Section & Slides, Remove All, Move Up/Down,
                          // Collapse/Expand All.
                          onContextMenu={(event) => {
                            if (preview) return;
                            event.preventDefault();
                            openSectionHeaderMenu(section.id, event.clientX, event.clientY);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "4px 8px",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#475569",
                          }}
                        >
                          <button
                            type="button"
                            aria-label={
                              collapsed
                                ? t("presentation.section.expand")
                                : t("presentation.section.collapse")
                            }
                            aria-expanded={!collapsed}
                            data-testid={`presentation-section-toggle-${section.id}`}
                            onClick={() => toggleSectionCollapsed(section.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              cursor: "pointer",
                              background: "none",
                              border: "none",
                              padding: 0,
                            }}
                          >
                            {collapsed ? (
                              <ChevronRight size={13} aria-hidden />
                            ) : (
                              <ChevronDown size={13} aria-hidden />
                            )}
                          </button>
                          <input
                            type="text"
                            value={sectionNameDrafts[section.id] ?? section.name}
                            aria-label={t("presentation.section.nameLabel")}
                            data-testid={`presentation-section-name-${section.id}`}
                            // The name is typed as a draft and renamed once,
                            // on Enter or on leaving the field: one Undo step
                            // for the whole rename, as PowerPoint's Rename
                            // Section. Escape keeps the name it had.
                            onChange={(event) => {
                              const typed = event.target.value;
                              setSectionNameDrafts((drafts) => ({
                                ...drafts,
                                [section.id]: typed,
                              }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.blur();
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                event.stopPropagation();
                                setSectionNameDrafts((drafts) => {
                                  const { [section.id]: _dropped, ...rest } = drafts;
                                  return rest;
                                });
                                const field = event.currentTarget;
                                requestAnimationFrame(() => field.blur());
                              }
                            }}
                            onBlur={() => {
                              const draft = sectionNameDrafts[section.id];
                              if (draft !== undefined && draft !== section.name) {
                                renameDeckSection(section.id, draft);
                              }
                              setSectionNameDrafts((drafts) => {
                                if (!(section.id in drafts)) return drafts;
                                const { [section.id]: _done, ...rest } = drafts;
                                return rest;
                              });
                            }}
                            maxLength={SECTION_NAME_MAX_LENGTH}
                            readOnly={preview}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#334155",
                              background: "transparent",
                              border: "1px solid transparent",
                              borderRadius: 4,
                              padding: "2px 4px",
                            }}
                          />
                          <span
                            aria-hidden
                            style={{ fontSize: 10.5, color: "#94a3b8" }}
                          >
                            {group.slides.length}
                          </span>
                          {preview ? null : (
                          <button
                            type="button"
                            aria-label={t("presentation.section.delete")}
                            title={t("presentation.section.delete")}
                            data-testid={`presentation-section-delete-${section.id}`}
                            // Not the first of several sections: nothing above
                            // it would take its slides (PowerPoint greys it).
                            disabled={!sectionMenuState(section.id).remove}
                            onClick={() => removeDeckSection(section.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              cursor: sectionMenuState(section.id).remove ? "pointer" : "default",
                              background: "none",
                              border: "none",
                              padding: 0,
                              color: "#94a3b8",
                              opacity: sectionMenuState(section.id).remove ? 1 : 0.4,
                            }}
                          >
                            <Trash2 size={12} aria-hidden />
                          </button>
                          )}
                        </div>
                      ) : null}
                      {collapsed ? null : group.slides.map(renderSlideButton)}
                    </div>
                  );
                })}
                {preview ? null : (
                  <LiveDraftUnitGhosts
                    pageId={ctl.liveDraftPageId}
                    variant="slide"
                    shown={slides.length}
                    aspectRatio={(() => {
                      const last = slides[slides.length - 1];
                      if (!last) return undefined;
                      const bounds = slideBounds(last);
                      return `${bounds.width} / ${bounds.height}`;
                    })()}
                  />
                )}
          </div>
        </aside>
  );
}
