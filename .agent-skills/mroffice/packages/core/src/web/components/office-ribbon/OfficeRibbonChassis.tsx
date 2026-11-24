/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Office-style ribbon CHASSIS — the docs editor toolbar's foundation
 * (tab row, overflow-scrolling strip, group container) extracted into one
 * shared, editor-neutral implementation, so every editor renders the same
 * base instead of keeping a parallel copy (模范化: this is the model the
 * document, presentation and spreadsheet ribbons converge on).
 *
 * Rendering is the docs original, faithfully: the same shared class names
 * (`note-editor-ribbon-tabs/tab/strip/body/track/scroll`), the same pager
 * semantics (the pair mounts whenever the strip overflows at all; an
 * unavailable side is native-disabled, removed from hit-testing/tab order and
 * visually retired while focus moves to the usable side or tabpanel), scroll
 * reset on tab switch (every tab opens from its start, Word/WPS behaviour),
 * ResizeObserver-driven re-measurement, and reduced-motion-aware smooth
 * scrolling. Overflow math is the SAME pure module docs uses
 * (`ribbonOverflow`), not a copy.
 *
 * Only identity is parameterized: `testIdPrefix` yields
 * `<prefix>-ribbon-tab-<key>` / `<prefix>-ribbon-scroll-left` / … so each
 * editor keeps its established testid namespace.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { revealRibbonControlInline } from "./ribbonReveal";
import { attachRibbonSidewaysWheel } from "./ribbonSidewaysWheel";
import { attachRibbonLastShownGroup } from "./ribbonLastShownGroup";
import { useTranslations } from "../../../host/next-intl";

import {
  computeRibbonOverflow,
  nextRibbonScrollLeft,
  RIBBON_SCROLL_EPSILON,
  type RibbonOverflowState,
} from "../console/editor/ribbonOverflow";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import { resyncHoverAfterScroll } from "../../lib/pointer-hover-resync";
import { screenScaleOf } from "../../lib/css-zoom";
import { boxWithin } from "../../lib/glide-geometry";
import { SURFACE_MOVE_EASE, SURFACE_MOVE_MS, surfaceMotionAllowed } from "../../lib/desk-motion";
import { onlyofficeRibbonFolded } from "../../lib/embed/onlyoffice-frame";
import { useCompactEditorChrome } from "../../lib/narrow-window";
import { glideRibbonFold, type RibbonFoldGlide } from "../../lib/ribbon-fold-motion";
import { OfficeRibbonKeyTips } from "./OfficeRibbonKeyTipLayer";
import { useOfficeRibbonCommandGate } from "./officeRibbonCommandGate";
import "./OfficeRibbonControl.css";
// The shared editor motion (keyframes and office-* utilities), which
// note-editor.css also imports for the Docs skin.
import "../../styles/office-motion.css";

export interface OfficeRibbonTabDescriptor<K extends string = string> {
  key: K;
  label: ReactNode;
  /** Optional editor-canonical control identity attached to the real tab. */
  controlId?: string;
  /** Extra class for contextual tabs (e.g. table/pivot tools tint). */
  className?: string;
  /** Contextual-tab marker, surfaced as `data-contextual`. */
  contextual?: string;
  /** Accessible name override when the visible label is not plain text. */
  ariaLabel?: string;
}

export interface OfficeRibbonStripTestIds {
  body?: string;
  track?: string;
  scrollLeft?: string;
  scrollRight?: string;
}

/**
 * Superset of the two historical chassis APIs. `testIdPrefix` is convenient
 * for a new ribbon; `testIds` preserves established ids while an editor moves
 * onto this canonical implementation. Both routes execute the same overflow
 * and focus behaviour below.
 */
export interface OfficeRibbonStripProps {
  activeTab: string;
  ariaLabel?: string;
  testIdPrefix?: string;
  testIds?: OfficeRibbonStripTestIds;
  panelId?: string;
  panelLabel?: string;
  panelLabelledBy?: string;
  scrollLeftLabel: string;
  scrollRightLabel: string;
  /**
   * Pixels per chevron click. Defaults to the docs step (240); pass a
   * function to scale with the strip viewport (the PDF ribbon pages by
   * ~72% of the visible width).
   */
  scrollStep?: number | ((clientWidth: number) => number);
  /** Extra data-attributes on the tabpanel body (legacy gating hooks). */
  bodyAttributes?: Record<string, string | undefined>;
  children: ReactNode;
}

/**
 * Content of a ribbon part that is in view only some of the time (a group
 * of a tab not shown, kept mounted and hidden by the tab gating): `children`
 * while shown; after it has been shown, while hidden, the element of the
 * first hidden render, handed back unchanged so React skips the subtree on
 * every later render of the editor; nothing before it was ever shown.
 * Showing it again updates the kept DOM in place rather than inserting it:
 * on an iPad inserting a tab's few hundred nodes cost ~200 ms of style work.
 */
export function useKeptWhileHidden(shown: boolean, children: ReactNode): ReactNode {
  const [everShown, setEverShown] = useState(shown);
  const [frozen, setFrozen] = useState<{ node: ReactNode } | null>(null);
  if (shown) {
    // state from earlier renders, updated during this one
    if (!everShown) setEverShown(true);
    if (frozen) setFrozen(null);
    return children;
  }
  if (!everShown) return null;
  if (!frozen) {
    setFrozen({ node: children });
    return children;
  }
  return frozen.node;
}

/** The tab list's least width beside the quick actions, ~3 tabs
 * (`.note-editor-ribbon-tabs__list` min-width in note-editor.css). */
const RIBBON_TABS_LIST_FLOOR = 200;

export function OfficeRibbonTabs<K extends string>({
  tabs,
  activeTab,
  onSelect,
  testIdPrefix,
  trailing,
  listLabel,
  listTestId,
  panelId,
  idPrefix,
  tabTestId,
  onTabPointerDown,
  attributes,
  scrollLeftLabel,
  scrollRightLabel,
  collapse,
  foldable = true,
  tabListHidden = false,
}: {
  tabs: ReadonlyArray<OfficeRibbonTabDescriptor<K>>;
  activeTab: K;
  onSelect: (key: K) => void;
  testIdPrefix: string;
  /** The title-row cluster after the tab list (undo/redo, export, …). */
  trailing?: ReactNode;
  listLabel?: string;
  /** Optional identity for the semantic tablist inside the shared container. */
  listTestId?: string;
  /** Single shared tabpanel id; without it each tab points at its own panel. */
  panelId?: string;
  /** The prefix of the tabs' DOM ids when it must differ from the test id
   * prefix (several instances in one document); defaults to testIdPrefix. */
  idPrefix?: string;
  /** Testid override per tab (defaults to `<prefix>-ribbon-tab-<key>`). */
  tabTestId?: (key: K) => string;
  /** Editors that must preserve selection across a tab press hook this. */
  onTabPointerDown?: () => void;
  /** Extra data-attributes on the tabs container (e.g. responsive markers). */
  attributes?: Record<string, string | undefined>;
  /** Names of the pagers a clipped tab row shows (default: Scroll tabs left / right). */
  scrollLeftLabel?: string;
  scrollRightLabel?: string;
  /**
   * The ribbon can fold away (the pen palette's Draw tab, lib/pen-first-draw):
   * a tap on the tab already selected folds it, as a tap on a tab shows or
   * hides the ribbon in Office for iPad. The Draw tab's own Hide the ribbon
   * button (OfficeInkHideRibbonCommand) is the one in sight.
   */
  collapse?: { onCollapse: () => void };
  /** False: the ribbon never folds to its tab row (a fold remembered from
   * another document is not applied). For a ribbon with no tab to unfold it
   * by: a handwriting document's Draw-only ribbon. */
  foldable?: boolean;
  /** The tab row shows no tabs, only its trailing cluster (a ribbon of one
   * tab: a handwriting document's Draw tab is its only top bar). */
  tabListHidden?: boolean;
}) {
  const t = useTranslations("console-notebooks");
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const w = window as unknown as { __ribbonRender?: Record<string, number> };
    w.__ribbonRender = w.__ribbonRender ?? {};
    w.__ribbonRender[testIdPrefix] = (w.__ribbonRender[testIdPrefix] ?? 0) + 1;
  }
  const tabsScrollLeftLabel = scrollLeftLabel ?? t("toolbar.ribbonTabsScrollLeft");
  const tabsScrollRightLabel = scrollRightLabel ?? t("toolbar.ribbonTabsScrollRight");
  const tabsContainerRef = useRef<HTMLDivElement | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<K, HTMLButtonElement>());
  // A swipe over a clipped tab list moves the tabs under a pointer that did
  // not move; the tab that slid away must not stay lit (pointer-hover-resync).
  useEffect(() => {
    const list = tabListRef.current;
    return list ? resyncHoverAfterScroll(list) : undefined;
  }, []);
  const tabCount = tabs.length;
  const contextualKeys = tabs
    .filter((tab) => tab.contextual)
    .map((tab) => String(tab.key))
    .join("\n");
  const shownContextualKeysRef = useRef("");
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  // The selected tab's underline is ONE indicator that slides to the tab
  
  // it takes each editor's own underline (the active tab's ::after: colour,
  // insets, thickness), which it then stands in for.
  const [indicator, setIndicator] = useState<{
    x: number;
    w: number;
    h: number;
    bottom: number;
    color: string;
    radius: string;
  } | null>(null);
  const indicatorReadyRef = useRef(false);
  // The tab under the pointer: the indicator grows while it is the selected one.
  const [hoveredTab, setHoveredTab] = useState<K | null>(null);
  const measureIndicator = useCallback(() => {
    const tab = tabRefs.current.get(activeTabRef.current);
    const list = tabListRef.current;
    if (!tab || !list || typeof window === "undefined") return;
    // A tab with no layout (a hidden strip, jsdom) has nothing to measure.
    if (tab.offsetWidth === 0) return;
    const after = window.getComputedStyle(tab, "::after");
    if (!after.content || after.content === "none") {
      setIndicator(null);
      return;
    }
    // The indicator is drawn inside the tab row, so it takes the row's own
    // CSS pixels. Under Touch mode's zoom some engines answer the tab's
    // offsets already zoomed, by one zoom or by all of them stacked (WebKit
    // with the page zoomed besides: the underline 150px off its tab): taken
    // as they came, those put the underline right of and below its tab, the
    
    // tab is measured as drawn, in the row's own pixels (lib/glide-geometry);
    // the underline's insets are its computed CSS pixels already.
    const box = boxWithin(tab, list);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const left = px(after.left);
    const right = px(after.right);
    const next = {
      x: box.x + left,
      w: Math.max(0, box.width - left - right),
      h: px(after.height) || 2,
      bottom: box.bottom + px(after.bottom),
      color: after.backgroundColor,
      radius: after.borderRadius,
    };
    setIndicator((previous) =>
      previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
    );
  }, []);
  // Measured when the selected tab or the tabs change (and by the observer
  // below when they resize), not on every render: measured each render, a
  // skin whose tab geometry answers the indicator itself (the PDF reader's)
  // re-rendered without end (「Maximum update depth exceeded」, every PDF
  
  // The first reading is the ResizeObserver's below, delivered once the
  // frame has laid the page out anyway; until it arrives the selected tab
  // draws its own underline, which the indicator stands in for. Read here on
  // mount, it laid out the whole desk in the middle of the commit that opens
  
  // 50-70 ms of style and layout in Chromium dev, up to 0.5 s in WebKit, for
  // every window opened while others loaded).
  const indicatorObservedRef = useRef(typeof ResizeObserver === "undefined");
  useLayoutEffect(() => {
    if (!indicatorObservedRef.current) return;
    measureIndicator();
  }, [measureIndicator, activeTab, tabCount, hoveredTab]);
  // Touch mode zooms the tab row: the tabs keep their CSS sizes, so no
  // resize is observed, while the selected tab's underline insets change
  // with it. Measured from before the switch, the indicator stood off its
  
  useEffect(() => {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        indicatorObservedRef.current = true;
        measureIndicator();
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-touch-mode"] });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measureIndicator]);
  useEffect(() => {
    const list = tabListRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      indicatorObservedRef.current = true;
      measureIndicator();
    });
    observer.observe(list);
    for (const tab of list.querySelectorAll(".note-editor-ribbon-tab")) observer.observe(tab);
    return () => observer.disconnect();
  }, [measureIndicator, tabCount]);
  useEffect(() => {
    // Placed without sliding the first time, then it slides.
    if (indicator && !indicatorReadyRef.current) {
      const frame = requestAnimationFrame(() => {
        indicatorReadyRef.current = true;
        tabListRef.current
          ?.querySelector(".note-editor-ribbon-tabs__indicator")
          ?.setAttribute("data-ready", "");
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [indicator]);
  // A press on the tab already selected folds the ribbon to its tab row, as
  // Office does; a press on any tab unfolds it. The Draw tab's pen palette
  // (`collapse`) keeps its own fold. Remembered per editor.
  const collapsedKey = `mrai.ribbon.collapsed.${testIdPrefix}`;
  const [storedRibbonCollapsed, setRibbonCollapsed] = useState(() => {
    try {
      if (typeof window === "undefined") return false;
      const stored = window.localStorage.getItem(collapsedKey);
      // An embedded editor whose integration asked for a compact toolbar
      // (lib/embed/onlyoffice-frame) opens folded until the person unfolds it.
      return stored === "1" || (stored === null && onlyofficeRibbonFolded());
    } catch {
      return onlyofficeRibbonFolded();
    }
  });
  // The compact chrome (a phone, an embedded mobile editor: lib/narrow-window)
  // folds the ribbon to its tab row whatever was remembered, and a tab shows
  // its commands over the page -- Office's "Show Tabs Only": the commands
  // stand over the document until it is touched again, the page underneath
  // keeping its place.
  const compactChrome = useCompactEditorChrome() && foldable && !collapse;
  const [peekAsked, setPeek] = useState(false);
  // Leaving the compact chrome (a phone turned, the switch to the full
  // editor) leaves no peek behind.
  const peek = compactChrome && peekAsked;
  const ribbonCollapsed = foldable && (compactChrome ? !peek : storedRibbonCollapsed);
  // Folding and unfolding glide: the command strip closes up into the tab
  // row (and opens out of it), the page below sliding with it on the
  // compositor (lib/ribbon-fold-motion); the fold a window opens with is
  // drawn at once.
  const foldMotionRef = useRef<{ shown: boolean; glide: RibbonFoldGlide | null }>({ shown: false, glide: null });
  useLayoutEffect(() => {
    const root = tabsContainerRef.current?.closest<HTMLElement>(".office-ribbon-skin");
    if (!root) return;
    const motion = foldMotionRef.current;
    const strip = root.querySelector<HTMLElement>(".note-editor-ribbon-strip");
    // An editor that frames the strip in a band of its own (the worksheet's
    // fixed-height Home surface) folds that band with it: otherwise the
    // folded ribbon left an empty band of its height under the tabs.
    const host = strip?.parentElement;
    if (host && host !== root) host.setAttribute("data-ribbon-strip-host", "");
    const state = () => {
      if (ribbonCollapsed) root.setAttribute("data-ribbon-collapsed", "true");
      else root.removeAttribute("data-ribbon-collapsed");
      if (compactChrome) root.setAttribute("data-ribbon-compact", "");
      else root.removeAttribute("data-ribbon-compact");
      if (peek) root.setAttribute("data-ribbon-peek", "");
      else root.removeAttribute("data-ribbon-peek");
    };
    // A glide still running lands first; the next starts from there.
    motion.glide?.finish();
    motion.glide = null;
    // A peek stands over the page: nothing below it moves, so nothing glides.
    const glide = !compactChrome && motion.shown && strip !== null && surfaceMotionAllowed() && typeof strip.animate === "function";
    motion.shown = true;
    if (!glide || !strip) {
      state();
      return;
    }
    motion.glide = glideRibbonFold(root, strip, ribbonCollapsed, state, {
      duration: SURFACE_MOVE_MS,
      easing: SURFACE_MOVE_EASE,
    });
  }, [ribbonCollapsed, compactChrome, peek]);
  // A peek ends where Office's does: a press in the document (anywhere in the
  // editor outside the ribbon -- a menu or dialog the ribbon opened lies
  // outside the editor and keeps it), Escape, or the selected tab again.
  useEffect(() => {
    if (!peek) return undefined;
    const root = tabsContainerRef.current?.closest<HTMLElement>(".office-ribbon-skin");
    const editor = root?.parentElement?.closest<HTMLElement>(
      ".native-page-window, .note-editor-wrapper, .wm-window, [data-embed-editor-root]",
    );
    if (!root || !editor) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || root.contains(target) || !editor.contains(target)) return;
      setPeek(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setPeek(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [peek]);
  const foldRibbon = (collapsed: boolean) => {
    setRibbonCollapsed(collapsed);
    try {
      if (collapsed) window.localStorage.setItem(collapsedKey, "1");
      else window.localStorage.removeItem(collapsedKey);
    } catch {
      // A private window keeps the fold for this session only.
    }
  };
  // Whether the tab was the selected one when the press BEGAN: an editor
  // may select a tab as it takes the focus (the deck does, for Ctrl+F6 and
  // the arrow keys), which a mouse press gives it before the click -- every
  // first press on a tab then read as a press on the selected one and
  // folded the ribbon.
  const pressStartRef = useRef<{ key: K; selected: boolean } | null>(null);
  const pressTab = (key: K) => {
    const start = pressStartRef.current;
    pressStartRef.current = null;
    const wasSelected = start && start.key === key ? start.selected : activeTab === key;
    if (compactChrome) {
      // Tabs only: a tab shows its commands, the one showing hides them.
      if (wasSelected && peek) {
        setPeek(false);
        return;
      }
      setPeek(true);
      if (!wasSelected) onSelect(key);
      return;
    }
    if (wasSelected) {
      if (collapse) collapse.onCollapse();
      else foldRibbon(!ribbonCollapsed);
      return;
    }
    if (ribbonCollapsed) foldRibbon(false);
    onSelect(key);
  };
  // The tab list scrolls sideways when the tabs are wider than their row;
  // the row then shows a pager at each end, as the command strip does, so a
  // mouse reaches View in a window put side by side (video audit S04).
  const [tabOverflow, setTabOverflow] = useState<
    RibbonOverflowState & { overflowing: boolean }
  >({ overflowing: false, canScrollLeft: false, canScrollRight: false });
  // When the user last moved the tab list themselves (a wheel, a swipe): a
  // reveal written while Safari scrolls that gesture on its own scrolling
  // thread sets the page's scroll position apart from the one it shows, and
  // a press then lands on a tab beside the one under the pointer.
  const userScrolledAtRef = useRef(Number.NEGATIVE_INFINITY);
  const revealTab = useCallback((key: K) => {
    const tab = tabRefs.current.get(key);
    const list = tab?.parentElement;
    if (!tab || !list || list.scrollWidth <= list.clientWidth) return;
    if (performance.now() - userScrolledAtRef.current < 600) return;
    const tabBox = tab.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    // Screen distances, written in the row's own scroll units (Touch mode
    // zooms the row: a screen pixel is less than one of its own).
    const scale = screenScaleOf(list);
    if (tabBox.left < listBox.left) {
      list.scrollLeft -= (listBox.left - tabBox.left) / scale;
    } else if (tabBox.right > listBox.right) {
      list.scrollLeft += (tabBox.right - listBox.right) / scale;
    }
  }, []);
  const measureTabs = useCallback(() => {
    const row = tabsContainerRef.current;
    const list = tabListRef.current;
    if (!row || !list || typeof window === "undefined") return;
    const rowStyle = window.getComputedStyle(row);
    const inner =
      row.clientWidth -
      (parseFloat(rowStyle.paddingLeft) || 0) -
      (parseFloat(rowStyle.paddingRight) || 0);
    // The list's share of the row without its pagers: what the row's other
    // items (the quick actions at their full width) leave, and never less
    // than the list's floor. The pagers do not count, so showing them cannot
    // turn them off again.
    const rowGap = parseFloat(rowStyle.columnGap) || 0;
    let beside = 0;
    for (const child of Array.from(row.children)) {
      if (child === list || !(child instanceof HTMLElement)) continue;
      if (child.matches(".note-editor-ribbon-tabs__pager")) continue;
      const childStyle = window.getComputedStyle(child);
      if (childStyle.display === "none" || childStyle.position === "absolute" || childStyle.position === "fixed") continue;
      beside += Math.max(child.scrollWidth, child.offsetWidth) + rowGap;
    }
    const available = Math.max(Math.min(inner, RIBBON_TABS_LIST_FLOOR), inner - beside);
    // The tabs' own width, whatever width the list was given: a list
    // stretched past its tabs reports no overflow of its own.
    const listStyle = window.getComputedStyle(list);
    const gap = parseFloat(listStyle.columnGap) || 0;
    let content =
      (parseFloat(listStyle.paddingLeft) || 0) +
      (parseFloat(listStyle.paddingRight) || 0);
    let count = 0;
    for (const tab of tabRefs.current.values()) {
      content += tab.offsetWidth;
      count += 1;
    }
    content += Math.max(0, count - 1) * gap;
    const overflowing = available > 0 && content > available + RIBBON_SCROLL_EPSILON;
    const scroll = overflowing
      ? computeRibbonOverflow({
          scrollLeft: list.scrollLeft,
          scrollWidth: list.scrollWidth,
          clientWidth: list.clientWidth,
        })
      : { canScrollLeft: false, canScrollRight: false };
    setTabOverflow((previous) =>
      previous.overflowing === overflowing &&
      previous.canScrollLeft === scroll.canScrollLeft &&
      previous.canScrollRight === scroll.canScrollRight
        ? previous
        : { overflowing, ...scroll },
    );
  }, []);
  // The row's width changes (a window put side by side, a resize, the quick
  // actions changing): the overflow is measured again and the tab in use is
  // kept in sight -- it had slid out of view with nothing to bring it back.
  useEffect(() => {
    const row = tabsContainerRef.current;
    const list = tabListRef.current;
    measureTabs();
    if (!row || !list || typeof ResizeObserver === "undefined") return;
    let width = row.clientWidth;
    const observer = new ResizeObserver(() => {
      measureTabs();
      if (row.clientWidth !== width) {
        width = row.clientWidth;
        revealTab(activeTabRef.current);
      }
    });
    observer.observe(row);
    observer.observe(list);
    return () => observer.disconnect();
  }, [measureTabs, revealTab]);
  useEffect(() => {
    measureTabs();
  }, [measureTabs, tabs.length]);
  // A mouse wheel turned over the clipped tabs moves them sideways (the row
  // has no vertical scroll of its own); the window's wheel handler leaves a
  // claimed wheel alone.
  useEffect(() => {
    const list = tabListRef.current;
    if (!list) return;
    const markUserScroll = () => {
      userScrolledAtRef.current = performance.now();
    };
    const detachWheel = attachRibbonSidewaysWheel(list, { onWheel: markUserScroll });
    list.addEventListener("touchmove", markUserScroll, { passive: true });
    return () => {
      detachWheel();
      list.removeEventListener("touchmove", markUserScroll);
    };
  }, []);
  const pageTabs = (direction: "left" | "right") => {
    const list = tabListRef.current;
    if (!list) return;
    const next = nextRibbonScrollLeft(
      {
        scrollLeft: list.scrollLeft,
        scrollWidth: list.scrollWidth,
        clientWidth: list.clientWidth,
      },
      direction,
      Math.max(80, Math.round(list.clientWidth * 0.7)),
    );
    if (typeof list.scrollTo === "function") {
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      list.scrollTo({ left: next, behavior: reduce ? "auto" : "smooth" });
    } else {
      list.scrollLeft = next;
    }
    measureTabs();
  };
  // A contextual tab (Chart Design, Table Design, …) is appended by the editor,
  // not by a press on it, so in a narrow window it can appear beyond the list's
  // clipped edge. An editor may select it (a new object) or only show it (an
  // existing one, as Excel does); either way the newly shown tab is brought
  // into view. Only the list scrolls, never the page.
  useEffect(() => {
    const shownBefore = new Set(shownContextualKeysRef.current.split("\n"));
    shownContextualKeysRef.current = contextualKeys;
    const appeared = tabs.filter(
      (tab) => tab.contextual && !shownBefore.has(String(tab.key)),
    );
    const target =
      appeared.length > 0 && !appeared.some((tab) => tab.key === activeTab)
        ? appeared[0].key
        : activeTab;
    revealTab(target);
    // `tabs` is read for the keys above only; its identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tabCount, contextualKeys]);
  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    key: K,
  ) => {
    const index = tabs.findIndex((tab) => tab.key === key);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onSelect(nextTab.key);
    const nextTabElement = tabRefs.current.get(nextTab.key);
    nextTabElement?.focus({ preventScroll: true });
    revealRibbonControlInline(nextTabElement);
  };
  return (
    <div
      ref={tabsContainerRef}
      className="note-editor-ribbon-tabs"
      data-testid={`${testIdPrefix}-ribbon-tabs`}
      data-tabs-overflow={tabOverflow.overflowing || undefined}
      data-tab-list-hidden={tabListHidden || undefined}
      {...attributes}
    >
      {tabOverflow.overflowing ? (
        <button
          type="button"
          className="note-editor-ribbon-tabs__pager"
          aria-label={tabsScrollLeftLabel}
          title={tabsScrollLeftLabel}
          aria-disabled={!tabOverflow.canScrollLeft}
          disabled={!tabOverflow.canScrollLeft}
          tabIndex={-1}
          data-testid={`${testIdPrefix}-ribbon-tabs-scroll-left`}
          onPointerDown={onTabPointerDown}
          onClick={() => pageTabs("left")}
        >
          <OfficeSemanticIcon semanticId="ribbon.scroll.left" size={18} />
        </button>
      ) : null}
      <div
        ref={tabListRef}
        onScroll={measureTabs}
        className="note-editor-ribbon-tabs__list"
        role="tablist"
        data-tab-indicator={indicator ? "on" : undefined}
        aria-orientation="horizontal"
        aria-label={listLabel}
        aria-keyshortcuts="Control+F6 Control+Shift+F6"
        data-testid={listTestId}
      >
        {tabs.map(
          ({ key, label, controlId, className, contextual, ariaLabel }) => (
            <button
              key={key}
              ref={(node) => {
                if (node) tabRefs.current.set(key, node);
                else tabRefs.current.delete(key);
              }}
              type="button"
              id={`${idPrefix ?? testIdPrefix}-ribbon-tab-${key}`}
              role="tab"
              aria-label={ariaLabel}
              aria-selected={activeTab === key}
              aria-controls={panelId ?? `${idPrefix ?? testIdPrefix}-ribbon-panel-${key}`}
              className={`note-editor-ribbon-tab${
                activeTab === key ? " note-editor-ribbon-tab--active" : ""
              }${className ? ` ${className}` : ""}`}
              data-contextual={contextual}
              data-control-id={controlId}
              data-testid={
                tabTestId ? tabTestId(key) : `${testIdPrefix}-ribbon-tab-${key}`
              }
              tabIndex={activeTab === key ? 0 : -1}
              onPointerDown={() => {
                pressStartRef.current = { key, selected: activeTab === key };
                onTabPointerDown?.();
              }}
              aria-expanded={activeTab === key ? !ribbonCollapsed : undefined}
              onPointerEnter={() => setHoveredTab(key)}
              onPointerLeave={() => setHoveredTab((current) => (current === key ? null : current))}
              onClick={() => pressTab(key)}
              onKeyDown={(event) => handleKeyDown(event, key)}
            >
              <span className="note-editor-ribbon-tab__face" data-press-face="">{label}</span>
            </button>
          ),
        )}
        {/* The editor's plugins (lib/plugins/ribbon-store): their own tab. */}
        {null}
        {indicator ? (
          <span
            aria-hidden="true"
            className="note-editor-ribbon-tabs__indicator"
            data-testid={`${testIdPrefix}-ribbon-tab-indicator`}
            {...(indicatorReadyRef.current ? { "data-ready": "" } : {})}
            {...(hoveredTab === activeTab ? { "data-grow": "" } : {})}
            style={
              {
                "--tab-indicator-x": `${indicator.x}px`,
                "--tab-indicator-w": `${indicator.w}px`,
                "--tab-indicator-h": `${indicator.h}px`,
                "--tab-indicator-bottom": `${indicator.bottom}px`,
                "--tab-indicator-color": indicator.color,
                "--tab-indicator-radius": indicator.radius,
              } as CSSProperties
            }
          />
        ) : null}
      </div>
      {tabOverflow.overflowing ? (
        <button
          type="button"
          className="note-editor-ribbon-tabs__pager"
          aria-label={tabsScrollRightLabel}
          title={tabsScrollRightLabel}
          aria-disabled={!tabOverflow.canScrollRight}
          disabled={!tabOverflow.canScrollRight}
          tabIndex={-1}
          data-testid={`${testIdPrefix}-ribbon-tabs-scroll-right`}
          onPointerDown={onTabPointerDown}
          onClick={() => pageTabs("right")}
        >
          <OfficeSemanticIcon semanticId="ribbon.scroll.right" size={18} />
        </button>
      ) : null}
      {trailing}
      <OfficeRibbonKeyTips
        activeTab={activeTab}
        tabs={tabs.map((tab) => ({
          key: tab.key,
          label:
            tab.ariaLabel ??
            (typeof tab.label === "string" ? tab.label : String(tab.key)),
        }))}
        tabRefs={tabRefs}
        tabsContainerRef={tabsContainerRef}
        testIdPrefix={testIdPrefix}
      />
    </div>
  );
}

export function OfficeRibbonStrip({
  activeTab,
  ariaLabel,
  testIdPrefix,
  testIds,
  panelId,
  panelLabel,
  panelLabelledBy,
  scrollLeftLabel,
  scrollRightLabel,
  scrollStep,
  bodyAttributes,
  children,
}: OfficeRibbonStripProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollLeftRef = useRef<HTMLButtonElement | null>(null);
  const scrollRightRef = useRef<HTMLButtonElement | null>(null);
  const [overflow, setOverflow] = useState<RibbonOverflowState>({
    canScrollLeft: false,
    canScrollRight: false,
  });

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = computeRibbonOverflow({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    });
    const activeElement =
      typeof document === "undefined" ? null : document.activeElement;
    if (activeElement === scrollLeftRef.current && !next.canScrollLeft) {
      if (next.canScrollRight) {
        scrollRightRef.current?.focus({ preventScroll: true });
      } else {
        el.focus({ preventScroll: true });
      }
    } else if (
      activeElement === scrollRightRef.current &&
      !next.canScrollRight
    ) {
      if (next.canScrollLeft) {
        scrollLeftRef.current?.focus({ preventScroll: true });
      } else {
        el.focus({ preventScroll: true });
      }
    }
    setOverflow((prev) =>
      prev.canScrollLeft === next.canScrollLeft &&
      prev.canScrollRight === next.canScrollRight
        ? prev
        : next,
    );
  }, []);

  // The group last pressed in this tab. A command that narrows the window
  // (View > Window > View Side by Side) left the strip scrolled to where the
  // group had been, so Synchronous Scrolling beside it was out of reach
  // until the window was widened again (video audit S04): when the strip's
  // width changes, the group in use is brought back into sight.
  // A mouse wheel turned over the command strip moves it sideways, as over
  // the tab row (attachRibbonSidewaysWheel): the strip scrolls only sideways
  // and a plain mouse has no sideways wheel, so a vertical tick over it went
  
  // its own wheel while it can scroll; one that cannot lets the strip take it.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    return attachRibbonSidewaysWheel(scroller);
  }, []);

  const groupInUseRef = useRef<HTMLElement | null>(null);
  const revealGroupInUse = useCallback(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    const group = groupInUseRef.current;
    if (!scroller || !track || !group || !group.isConnected || !track.contains(group)) return;
    if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const view = scroller.getBoundingClientRect();
    const box = group.getBoundingClientRect();
    // Clear of the pagers floating over each end.
    const inset = Math.min(48, view.width / 6);
    // Screen distances in the strip's own scroll units (Touch mode zoom).
    const scale = screenScaleOf(scroller);
    if (box.left < view.left + inset) {
      scroller.scrollLeft -= (view.left + inset - box.left) / scale;
    } else if (box.right > view.right - inset) {
      scroller.scrollLeft += Math.min(
        box.right - (view.right - inset),
        box.left - (view.left + inset),
      ) / scale;
    }
  }, []);

  useEffect(() => {
    update();
    if (typeof ResizeObserver === "undefined") return;
    let width = scrollerRef.current?.clientWidth ?? 0;
    const observer = new ResizeObserver(() => {
      const scroller = scrollerRef.current;
      if (scroller && scroller.clientWidth !== width) {
        width = scroller.clientWidth;
        revealGroupInUse();
      }
      update();
    });
    if (scrollerRef.current) observer.observe(scrollerRef.current);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, [revealGroupInUse, update]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el && el.scrollLeft !== 0) el.scrollLeft = 0;
    groupInUseRef.current = null;
    update();
  }, [activeTab, update]);

  // No divider after the band's last group, whichever tab it belongs to
  // (ribbonLastShownGroup): kept right while groups come, go, show or hide.
  // A new tab shows and hides groups, which their ResizeObserver reports
  // after layout and before paint; read in a layout effect instead, the
  // groups' boxes forced a layout of the whole window (a long document
  // composing its pages in WebKit: ~40 s over its open).
  useEffect(() => {
    const track = trackRef.current;
    return track ? attachRibbonLastShownGroup(track) : undefined;
  }, []);

  // The strip's commands slide under a resting pointer the same way the tabs
  // do; the command that slid away must not stay lit either.
  useEffect(() => {
    const scroller = scrollerRef.current;
    return scroller ? resyncHoverAfterScroll(scroller) : undefined;
  }, []);

  // A menu or popover opened from a command stays anchored to it while the
  // strip scrolls, so it slid out of the editor window with its command.
  // Once the open flyout's edge leaves the window the flyout is dismissed,
  // and it opens again by itself when scrolling brings its command's place
  // back inside; any other pointer press forgets it.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let parked: { trigger: HTMLElement; width: number; height: number } | null = null;
    const windowBounds = (): DOMRect => {
      const host = scroller.closest<HTMLElement>(".wm-window") ?? scroller;
      return host.getBoundingClientRect();
    };
    const openFlyout = (): { trigger: HTMLElement; content: HTMLElement } | null => {
      for (const trigger of scroller.querySelectorAll<HTMLElement>('[aria-expanded="true"][aria-controls]')) {
        const content = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
        if (content && !scroller.contains(content)) return { trigger, content };
      }
      return null;
    };
    let dismissing = false;
    const pointerPress = () => {
      const init = { bubbles: true, cancelable: true, button: 0, buttons: 1 };
      return typeof PointerEvent === "function"
        ? new PointerEvent("pointerdown", { ...init, pointerType: "mouse", isPrimary: true })
        : new MouseEvent("pointerdown", init);
    };
    const toggle = (trigger: HTMLElement) => {
      trigger.dispatchEvent(pointerPress());
      if (trigger.getAttribute("aria-haspopup") !== "menu") trigger.click();
    };
    // The flyout is repositioned a frame after the strip scrolls (Floating
    // UI's autoUpdate), so the edge is read after that frame, and once more
    // a little later for a positioner that batches.
    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | null = null;
    // The flyout that was open when the strip scrolled: only it can have
    // slid out with its command. One opened by a click in the checks' wait
    // (a trackpad's momentum keeps the strip moving) is a new intent; read
    // while Floating UI still holds it unplaced (at the origin, shifted off
    // by a transform), it looked like a flyout outside the window and was
    // closed as it opened.
    let openAtScroll: HTMLElement | null = null;
    // Where that flyout stood when the strip began to scroll: a flyout the
    // positioner had already pushed against the screen edge (a command at the
    // window's right end) stands past the window's edge before any scroll,
    // and a scroll that did not carry it further out is no reason to close it
    
    // strip settled by a pixel after a new shape).
    let rectAtScroll: DOMRect | null = null;
    const onScroll = () => {
      if (!frame && !settle) {
        const atScroll = openFlyout();
        openAtScroll = atScroll?.trigger ?? null;
        rectAtScroll = atScroll ? atScroll.content.getBoundingClientRect() : null;
      }
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = 0;
          check();
        });
      });
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        settle = null;
        check();
        openAtScroll = null;
        rectAtScroll = null;
      }, 160);
    };
    const check = () => {
      const bounds = windowBounds();
      const open = openFlyout();
      if (open) {
        if (open.trigger !== openAtScroll) return;
        const rect = open.content.getBoundingClientRect();
        if (rect.width === 0) return;
        // Not placed yet: Floating UI parks a flyout above the viewport
        // (translate(0, -200%)) until it is measured. Opening a menu can
        // itself scroll the strip, and that flyout read as one that slid
        // out of the window and was closed as it opened (the first menu
        // after a sheet opens, R-5).
        if (rect.bottom <= 0) return;
        const before = rectAtScroll;
        const carriedOut =
          before === null ||
          before.width === 0 ||
          before.bottom <= 0 ||
          rect.right > Math.max(bounds.right, before.right) + 1 ||
          rect.left < Math.min(bounds.left, before.left) - 1;
        const triggerRect = open.trigger.getBoundingClientRect();
        const triggerCentre = triggerRect.left + triggerRect.width / 2;
        const triggerOut = triggerCentre > bounds.right || triggerCentre < bounds.left;
        if ((rect.right > bounds.right || rect.left < bounds.left) && (carriedOut || triggerOut)) {
          parked = { trigger: open.trigger, width: rect.width, height: rect.height };
          // Dismissed as a press outside is, not with Escape: Escape hands
          // the focus back to the command, and focusing it scrolls the strip
          // back to it, which would undo the scroll that just happened.
          dismissing = true;
          try {
            document.body.dispatchEvent(pointerPress());
          } finally {
            dismissing = false;
          }
        }
        return;
      }
      if (!parked) return;
      if (!parked.trigger.isConnected || parked.trigger.getAttribute("aria-expanded") === "true") {
        parked = null;
        return;
      }
      const anchor = parked.trigger.getBoundingClientRect();
      // Where the flyout would sit: its start edge on the command's.
      const left = anchor.left;
      const right = left + parked.width;
      if (left >= bounds.left && right <= bounds.right) {
        const trigger = parked.trigger;
        parked = null;
        toggle(trigger);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      // The strip's own pager buttons scroll on; anything else is a new intent.
      if (dismissing) return;
      if (parked && !(event.target instanceof Element && event.target.closest(".note-editor-ribbon-scroll"))) {
        parked = null;
      }
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (frame) cancelAnimationFrame(frame);
      if (settle) clearTimeout(settle);
    };
  }, []);

  const scrollByStep = useCallback(
    (direction: "left" | "right") => {
      const el = scrollerRef.current;
      if (!el) return;
      const step =
        typeof scrollStep === "function"
          ? scrollStep(el.clientWidth)
          : scrollStep;
      const next = nextRibbonScrollLeft(
        {
          scrollLeft: el.scrollLeft,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        },
        direction,
        step,
      );
      if (typeof el.scrollTo === "function") {
        const reduce =
          typeof window !== "undefined" &&
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        el.scrollTo({ left: next, behavior: reduce ? "auto" : "smooth" });
      } else {
        el.scrollLeft = next;
      }
      update();
    },
    [scrollStep, update],
  );

  const anyOverflow = overflow.canScrollLeft || overflow.canScrollRight;
  // The pagers stand over the strip's ends, over commands: at rest they fade
  // out of the way and come back while the strip scrolls (wheel, trackpad,
  
  
  const stripRef = useRef<HTMLDivElement | null>(null);
  const scrollingTimerRef = useRef<number | null>(null);
  const markScrolling = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.setAttribute("data-ribbon-scrolling", "");
    if (scrollingTimerRef.current !== null) window.clearTimeout(scrollingTimerRef.current);
    scrollingTimerRef.current = window.setTimeout(() => {
      scrollingTimerRef.current = null;
      stripRef.current?.removeAttribute("data-ribbon-scrolling");
    }, 1200);
  }, []);
  useEffect(
    () => () => {
      if (scrollingTimerRef.current !== null) window.clearTimeout(scrollingTimerRef.current);
    },
    [],
  );
  const resolvedTestIds: OfficeRibbonStripTestIds = {
    body:
      testIds?.body ??
      (testIdPrefix ? `${testIdPrefix}-ribbon-body` : undefined),
    track: testIds?.track,
    scrollLeft:
      testIds?.scrollLeft ??
      (testIdPrefix ? `${testIdPrefix}-ribbon-scroll-left` : undefined),
    scrollRight:
      testIds?.scrollRight ??
      (testIdPrefix ? `${testIdPrefix}-ribbon-scroll-right` : undefined),
  };
  return (
    <div
      ref={stripRef}
      className="note-editor-ribbon-strip"
      role={ariaLabel && !panelId ? "toolbar" : undefined}
      aria-label={ariaLabel}
      data-can-scroll-left={overflow.canScrollLeft || undefined}
      data-can-scroll-right={overflow.canScrollRight || undefined}
      data-testid={testIdPrefix ? `${testIdPrefix}-ribbon-strip` : undefined}
    >
      {anyOverflow ? (
        <button
          ref={scrollLeftRef}
          type="button"
          className="note-editor-ribbon-scroll note-editor-ribbon-scroll--left"
          aria-label={scrollLeftLabel}
          title={scrollLeftLabel}
          aria-disabled={!overflow.canScrollLeft}
          disabled={!overflow.canScrollLeft}
          tabIndex={overflow.canScrollLeft ? 0 : -1}
          data-ribbon-scroll-retired={!overflow.canScrollLeft || undefined}
          data-testid={resolvedTestIds.scrollLeft}
          // A press keeps the focus where it is: the button took it, and a
          // text being edited in place (a PDF line) lost its editor on a
          // click that only meant to reach a cut-off command (C-0076).
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (overflow.canScrollLeft) scrollByStep("left");
          }}
        >
          <OfficeSemanticIcon semanticId="ribbon.scroll.left" size={24} />
        </button>
      ) : null}
      <div
        ref={scrollerRef}
        className="note-editor-ribbon-body"
        data-ribbon-active={activeTab}
        data-testid={resolvedTestIds.body}
        id={panelId}
        role={panelId ? "tabpanel" : undefined}
        aria-label={panelLabel}
        aria-labelledby={panelLabelledBy}
        tabIndex={-1}
        onScroll={() => {
          update();
          markScrolling();
        }}
        onPointerDownCapture={(event) => {
          // The track's own child that holds the pressed control: its group.
          const track = trackRef.current;
          let node = event.target instanceof Element ? event.target : null;
          while (node && node.parentElement !== track) node = node.parentElement;
          if (node instanceof HTMLElement) groupInUseRef.current = node;
        }}
        {...bodyAttributes}
      >
        <div
          ref={trackRef}
          className="note-editor-ribbon-track"
          data-testid={resolvedTestIds.track}
        >
          {children}
        </div>
      </div>
      {anyOverflow ? (
        <button
          ref={scrollRightRef}
          type="button"
          className="note-editor-ribbon-scroll note-editor-ribbon-scroll--right"
          aria-label={scrollRightLabel}
          title={scrollRightLabel}
          aria-disabled={!overflow.canScrollRight}
          disabled={!overflow.canScrollRight}
          tabIndex={overflow.canScrollRight ? 0 : -1}
          data-ribbon-scroll-retired={!overflow.canScrollRight || undefined}
          data-testid={resolvedTestIds.scrollRight}
          // A press keeps the focus where it is: the button took it, and a
          // text being edited in place (a PDF line) lost its editor on a
          // click that only meant to reach a cut-off command (C-0076).
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (overflow.canScrollRight) scrollByStep("right");
          }}
        >
          <OfficeSemanticIcon semanticId="ribbon.scroll.right" size={24} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * A group's dialog box launcher: Office's small arrow in the group's lower
 * right corner, on the caption's line, which opens the group's full dialog
 * or pane (Word's Font, Paragraph and Styles; Excel's Format Cells;
 * PowerPoint's Format Shape). It has no visible label; `label` names it for
 * assistive tech and the tooltip.
 */
export interface OfficeRibbonGroupLauncher {
  label: string;
  onClick: () => void;
  /** The dialog or pane it opens is showing, or holds a non-default value. */
  active?: boolean;
  disabled?: boolean;
  /** Exact explanation appended to the accessible label while disabled. */
  disabledReason?: string;
  keyShortcuts?: string;
  controlId?: string;
  testId?: string;
}

/** One labelled command group inside the strip. */
export function OfficeRibbonGroup({
  label,
  ribbon,
  controlId,
  className,
  style,
  testId,
  dataAttributes,
  ariaBusy,
  launcher,
  children,
}: {
  label?: string;
  ribbon?: string;
  controlId?: string;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  dataAttributes?: Record<`data-${string}`, string | undefined>;
  ariaBusy?: boolean;
  launcher?: OfficeRibbonGroupLauncher;
  children: ReactNode;
}) {
  const launcherName = launcher
    ? launcher.disabled && launcher.disabledReason
      ? `${launcher.label} — ${launcher.disabledReason}`
      : launcher.label
    : undefined;
  return (
    <div
      className={`note-editor-office-toolbar__group${
        className ? ` ${className}` : ""
      }`}
      data-ribbon={ribbon}
      data-ribbon-label={label}
      data-control-id={controlId}
      data-testid={testId}
      {...dataAttributes}
      aria-busy={ariaBusy || undefined}
      role="group"
      aria-label={label}
      style={style}
    >
      {children}
      {launcher ? (
        <button
          type="button"
          className="office-ribbon-group-launcher"
          aria-label={launcherName}
          title={launcherName}
          aria-keyshortcuts={launcher.keyShortcuts}
          aria-pressed={launcher.active}
          aria-haspopup="dialog"
          disabled={launcher.disabled}
          data-control-id={launcher.controlId}
          data-office-ribbon-group-launcher=""
          data-testid={launcher.testId}
          // a dialog must wait for the click: mounting its backdrop on
          // pointer-down lets the same press dismiss it
          onMouseDown={(event) => event.preventDefault()}
          onClick={launcher.onClick}
        >
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            <path
              d="M1.5 6V1.5H6M4.2 4.2l4.3 4.3M8.5 5.4v3.1H5.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

/** Horizontal run used by all Office-style ribbon groups. */
export function RibbonHStack({
  className,
  testId,
  children,
}: {
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`note-editor-ribbon-hstack${className ? ` ${className}` : ""}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/** Vertical stack for the two- or three-row command anatomy. */








export const OFFICE_RIBBON_SMALL_FACE_SELECTOR =
  'button.note-editor-office-toolbar__button, [data-office-home-split="true"], [data-office-home-command-row="true"]';

 
export function officeRibbonStackIsLane(stack: HTMLElement): boolean {
  const children = Array.from(stack.children);
  const smallFace = (element: Element): boolean =>
    element.matches(OFFICE_RIBBON_SMALL_FACE_SELECTOR) &&
    !element.classList.contains("note-editor-ribbon-big");
  return (
    children.length === 3 &&
    children.every(
      (child) =>
        smallFace(child) ||
        // a face inside its own wrapper (a tooltip's span, a menu's anchor)
        (child.children.length === 1 && smallFace(child.children[0]!)),
    )
  );
}





export function useOfficeRibbonLaneMark(
  ref: { current: HTMLElement | null },
  attribute: string,
  explicit: boolean,
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const lane = explicit || officeRibbonStackIsLane(element);
    if (lane) element.setAttribute(attribute, "3");
    else element.removeAttribute(attribute);
  });
}

export function RibbonCol({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useOfficeRibbonLaneMark(ref, "data-ribbon-lane", false);
  return (
    <div
      ref={ref}
      className={`note-editor-ribbon-col${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

export function RibbonRow({
  fill = false,
  className,
  children,
}: {
  fill?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`note-editor-ribbon-row${fill ? " note-editor-ribbon-row--fill" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </div>
  );
}

export interface OfficeRibbonButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children" | "className" | "onClick" | "onMouseDown"
> {
  /**
   * Dialog launchers must wait for the native click. Mounting a full-screen
   * backdrop during pointer-down makes the matching pointer-up land on that
   * newly mounted backdrop and immediately dismiss the dialog.
   */
  activation?: "pointerDown" | "click";
  active?: boolean | "mixed";
  big?: boolean;
  /** Exact rendered button authority for dialogs, focus return and anchors. */
  buttonRef?: Ref<HTMLButtonElement>;
  





  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}

/**
 * Shared command primitive for docs and sheets. Pointer activation runs on
 * mouse-down so clicking a ribbon control cannot collapse the editor's live
 * selection; keyboard/click-only automation uses the guarded click fallback.
 */
export function OfficeRibbonButton({
  activation = "pointerDown",
  active,
  big = false,
  buttonRef,
  ref: slotRef,
  children,
  className,
  disabled: ownDisabled,
  label,
  onClick,
  testId,
  ...buttonProps
}: OfficeRibbonButtonProps) {
  // A selection gate provided by the host greys commands that cannot act on
  // the selected object; the reason reaches the accessible name and title.
  const gated = useOfficeRibbonCommandGate(testId, ownDisabled, undefined);
  const disabled = gated.disabled;
  const gateReason = gated.disabledReason;
  const pointerHandledRef = useRef(false);
  const setButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      for (const target of [buttonRef, slotRef]) {
        if (typeof target === "function") target(node);
        else if (target) {
          (target as { current: HTMLButtonElement | null }).current = node;
        }
      }
    },
    [buttonRef, slotRef],
  );
  const runFromPointer = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.button !== 0 || disabled) return;
    if (activation === "click") return;
    pointerHandledRef.current = true;
    onClick();
  };
  const runFromClick = () => {
    if (disabled) return;
    if (activation === "click") {
      onClick();
      return;
    }
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
      return;
    }
    onClick();
  };

  const baseClass = big
    ? `note-editor-ribbon-big${active ? " note-editor-ribbon-big--active" : ""}`
    : `note-editor-office-toolbar__button${active ? " is-active" : ""}`;

  return (
    <button
      {...buttonProps}
      ref={setButtonRef}
      type="button"
      className={`office-ribbon-control ${baseClass}${className ? ` ${className}` : ""}`}
      data-office-control-part="button"
      aria-label={gateReason ? `${label}: ${gateReason}` : label}
      aria-pressed={active}
      data-testid={testId}
      data-disabled-reason={
        gateReason ??
        (buttonProps as { "data-disabled-reason"?: string })["data-disabled-reason"]
      }
      disabled={disabled}
      onMouseDown={runFromPointer}
      onClick={runFromClick}
      title={gateReason ? `${label}: ${gateReason}` : label}
    >
      {children}
    </button>
  );
}

/** Large icon-over-label convenience wrapper. */
export function RibbonBigButton({
  label,
  displayLabel,
  icon,
  onClick,
  active,
  disabled = false,
  testId,
  className,
  labelClassName,
}: {
  label: string;
  displayLabel?: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <OfficeRibbonButton
      big
      active={active}
      disabled={disabled}
      label={label}
      onClick={onClick}
      testId={testId}
      className={className}
    >
      <span aria-hidden>{icon}</span>
      <span className={labelClassName}>{displayLabel ?? label}</span>
    </OfficeRibbonButton>
  );
}
