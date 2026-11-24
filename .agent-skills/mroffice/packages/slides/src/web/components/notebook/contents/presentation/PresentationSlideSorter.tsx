"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * PowerPoint's Slide Sorter view (View > Slide Sorter, the status bar's
 * sorter button; audit PPT-E011): the whole deck as a grid of thumbnails in
 * place of the thumbnail pane and the slide.
 *
 * Microsoft Support ("Choose the right view for the task", "Add, rearrange,
 * duplicate, and delete slides", "Hide or show a slide", "Organize your
 * slides into sections"):
 *  - click selects a slide, Ctrl/Cmd+click adds or removes one, Shift+click
 *    selects the run from the last clicked slide;
 *  - dragging a slide (or the selected slides together) moves it;
 *  - a hidden slide's number is struck through;
 *  - sections head their slides and collapse, showing their slide count;
 *  - double-clicking a slide opens it in Normal view.
 * The keyboard follows the thumbnail pane's: arrows move between slides
 * (Shift extends the selection), Home / End go to the ends, Ctrl/Cmd+A
 * selects every slide, Delete removes the selection, Enter opens the slide.
 *
 * A VIEW: it owns its selection only. Every change goes back to the editor
 * through the same writers the rail uses (`onReorder`, `onDelete`), and the
 * selection math is `lib/presentation-sorter`'s.
 */

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";

import {
  canBulkDelete,
  dragGroupIds,
  nextSelection,
} from "../../../../lib/presentation-sorter";
import { isDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import { reorderIds, useTouchReorder } from "@mrnote/core/web/lib/use-touch-reorder.ts";
import type { SlideDrop } from "@mrnote/core/web/lib/presentation-sections.ts";

import styles from "./PresentationSlideSorter.module.css";

export interface PresentationSorterSlide {
  readonly id: string;
  readonly title: string;
}

export interface PresentationSorterGroup<S extends PresentationSorterSlide> {
  readonly section: { readonly id: string; readonly name: string } | null;
  readonly slides: readonly S[];
}

export interface PresentationSlideSorterLabels {
  readonly region: string;
  readonly untitled: string;
  /** "Slide 3" for a thumbnail's accessible name. */
  readonly slide: (number: number, title: string) => string;
  readonly hidden: string;
  /** "3 slides" beside a section name. */
  readonly sectionCount: (count: number) => string;
}

export interface PresentationSlideSorterProps<S extends PresentationSorterSlide> {
  readonly groups: readonly PresentationSorterGroup<S>[];
  /** Every slide in deck order. */
  readonly order: readonly string[];
  readonly activeId: string | null;
  readonly collapsedSections: ReadonlySet<string>;
  readonly onToggleSection: (sectionId: string) => void;
  /** A section header's right-click menu (PowerPoint's Section commands). */
  readonly onSectionContextMenu?: (sectionId: string, clientX: number, clientY: number) => void;
  readonly isHidden: (slide: S) => boolean;
  /**
   * A slide's thumbnail. A cell is drawn again only when its slide, place or
   * state changes, or this function does: keep it stable (useCallback) over
   * what it draws besides the slide.
   */
  readonly renderThumbnail: (slide: S) => ReactNode;
  readonly labels: PresentationSlideSorterLabels;
  readonly readOnly: boolean;
  /** The slide the selection is anchored on became the current slide. */
  readonly onActivate: (slideId: string) => void;
  /** Double-click / Enter: back to Normal view on that slide. */
  readonly onOpen: (slideId: string) => void;
  readonly onReorder: (nextOrder: readonly string[], keepActiveId: string, drop?: SlideDrop) => void;
  readonly onDelete: (slideIds: readonly string[]) => void;
  /**
   * The context menu for `slideId` at (x, y). `slideIds` is the selection the
   * menu's commands act on: every selected slide when the pressed one is among
   * them, else just the pressed one (PPT-B401).
   */
  readonly onContextMenu: (slideId: string, x: number, y: number, slideIds: readonly string[]) => void;
  




  readonly onSlideShortcut?: (
    key: "c" | "x" | "v" | "d",
    slideId: string,
    slideIds: readonly string[],
  ) => void;
}

/** How many cells sit in one row of the grid, read from the laid-out cells. */
function columnsOf(grid: HTMLElement | null): number {
  if (!grid) return 1;
  const cells = Array.from(
    grid.querySelectorAll<HTMLElement>("[data-sorter-slide-id]"),
  );
  if (cells.length < 2) return 1;
  const firstTop = cells[0]!.offsetTop;
  const perRow = cells.findIndex((cell) => cell.offsetTop !== firstTop);
  return perRow > 0 ? perRow : cells.length;
}

interface SorterCellActions<S extends PresentationSorterSlide> {
  click: (slide: S, event: ReactMouseEvent<HTMLDivElement>) => void;
  open: (slide: S) => void;
  keyDown: (slide: S, event: ReactKeyboardEvent<HTMLDivElement>) => void;
  contextMenu: (slide: S, event: ReactMouseEvent<HTMLDivElement>) => void;
}

/** One slide of the sorter, memoized on what it shows (see `cellActions`). */
const SorterCell = memo(function SorterCell<S extends PresentationSorterSlide>({
  slide,
  number,
  hidden,
  selected,
  current,
  tabbable,
  label,
  render,
  actions,
}: {
  slide: S;
  number: number;
  hidden: boolean;
  selected: boolean;
  current: boolean;
  tabbable: boolean;
  label: string;
  render: (slide: S) => ReactNode;
  actions: RefObject<SorterCellActions<S> | null>;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      aria-current={current ? "true" : undefined}
      aria-label={label}
      tabIndex={tabbable ? 0 : -1}
      className={styles.cell}
      data-selected={selected ? "true" : undefined}
      data-hidden={hidden ? "true" : undefined}
      data-sorter-slide-id={slide.id}
      data-testid="presentation-sorter-cell"
      draggable={false}
      onClick={(event) => actions.current?.click(slide, event)}
      onDoubleClick={() => actions.current?.open(slide)}
      onKeyDown={(event) => actions.current?.keyDown(slide, event)}
      onContextMenu={(event) => actions.current?.contextMenu(slide, event)}
    >
      <span className={styles.thumbnail}>{render(slide)}</span>
      <span className={styles.number} data-testid="presentation-sorter-number">
        {number}
      </span>
    </div>
  );
}) as <S extends PresentationSorterSlide>(props: {
  slide: S;
  number: number;
  hidden: boolean;
  selected: boolean;
  current: boolean;
  tabbable: boolean;
  label: string;
  render: (slide: S) => ReactNode;
  actions: RefObject<SorterCellActions<S> | null>;
}) => ReactElement;

export function PresentationSlideSorter<S extends PresentationSorterSlide>({
  groups,
  order,
  activeId,
  collapsedSections,
  onToggleSection,
  onSectionContextMenu,
  isHidden,
  renderThumbnail,
  labels,
  readOnly,
  onActivate,
  onOpen,
  onReorder,
  onDelete,
  onContextMenu,
  onSlideShortcut,
}: PresentationSlideSorterProps<S>): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<{
    selected: ReadonlySet<string>;
    anchor: string | null;
  }>(() => ({
    selected: new Set(activeId ? [activeId] : []),
    anchor: activeId,
  }));
  const [focusId, setFocusId] = useState<string | null>(activeId);

  // Slides that left the deck leave the selection.
  const present = useMemo(() => new Set(order), [order]);
  const selected = useMemo(
    () => new Set([...selection.selected].filter((id) => present.has(id))),
    [present, selection.selected],
  );

  const numberOf = useMemo(() => {
    const map = new Map<string, number>();
    order.forEach((id, index) => map.set(id, index + 1));
    return map;
  }, [order]);

  /** The slides a keyboard step can reach: collapsed sections are skipped. */
  const visibleOrder = useMemo(
    () =>
      groups.flatMap((group) =>
        group.section && collapsedSections.has(group.section.id)
          ? []
          : group.slides.map((slide) => slide.id),
      ),
    [collapsedSections, groups],
  );

  const focusCell = (slideId: string) => {
    const cell = rootRef.current?.querySelector<HTMLElement>(
      `[data-sorter-slide-id="${CSS.escape(slideId)}"]`,
    );
    cell?.focus({ preventScroll: false });
  };

  // Entering the view puts the keyboard on the current slide.
  useEffect(() => {
    if (activeId) focusCell(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry only
  }, []);

  const select = (
    slideId: string,
    modifiers: { shift?: boolean; meta?: boolean },
  ) => {
    const next = nextSelection(order, selected, slideId, modifiers, selection.anchor);
    setSelection(next);
    setFocusId(slideId);
    if (!modifiers.shift && !modifiers.meta) onActivate(slideId);
  };

  /** The slides a context menu opened on `slideId` acts on (PPT-B401). */
  const menuTargets = (slideId: string): string[] =>
    selected.has(slideId) ? order.filter((id) => selected.has(id)) : [slideId];

  const deleteSelection = () => {
    if (readOnly) return;
    const ids = order.filter((id) => selected.has(id));
    if (!canBulkDelete(order.length, ids.length)) return;
    const firstIndex = order.indexOf(ids[0]!);
    const survivor =
      order.slice(firstIndex).find((id) => !selected.has(id)) ??
      [...order.slice(0, firstIndex)].reverse().find((id) => !selected.has(id)) ??
      null;
    onDelete(ids);
    if (survivor) {
      setSelection({ selected: new Set([survivor]), anchor: survivor });
      setFocusId(survivor);
      onActivate(survivor);
      requestAnimationFrame(() => focusCell(survivor));
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>, slideId: string) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.altKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      event.stopPropagation();
      setSelection({ selected: new Set(order), anchor: slideId });
      return;
    }
    const shortcut = event.key.toLowerCase();
    if (
      mod &&
      !event.altKey &&
      onSlideShortcut &&
      (shortcut === "c" || shortcut === "x" || shortcut === "v" || shortcut === "d") &&
      (shortcut === "c" || !readOnly)
    ) {
      event.preventDefault();
      event.stopPropagation();
      onSlideShortcut(shortcut, slideId, menuTargets(slideId));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onOpen(slideId);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      deleteSelection();
      return;
    }
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      onContextMenu(slideId, rect.left + 24, rect.top + 24, menuTargets(slideId));
      return;
    }
    const at = visibleOrder.indexOf(slideId);
    if (at < 0) return;
    // The columns of the grid the focused slide is in: every section has its
    // own grid, and the first one's row (a default section of one slide)
    // said nothing about the row below in the next (PPT-B434).
    const ownGrid = rootRef.current
      ?.querySelector<HTMLElement>(`[data-sorter-slide-id="${CSS.escape(slideId)}"]`)
      ?.closest<HTMLElement>('[role="listbox"]');
    const columns = columnsOf(ownGrid ?? rootRef.current);
    const step =
      event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowLeft"
          ? -1
          : event.key === "ArrowDown"
            ? columns
            : event.key === "ArrowUp"
              ? -columns
              : null;
    let target: string | undefined;
    if (step !== null) {
      target = visibleOrder[Math.max(0, Math.min(visibleOrder.length - 1, at + step))];
    } else if (event.key === "Home") {
      target = visibleOrder[0];
    } else if (event.key === "End") {
      target = visibleOrder[visibleOrder.length - 1];
    }
    if (!target) return;
    event.preventDefault();
      event.stopPropagation();
    select(target, { shift: event.shiftKey });
    focusCell(target);
  };

  // A finger holds a slide (or the selected slides) to lift it and drags it
  
  // at the new location). The mouse keeps the HTML5 drag below.
  useTouchReorder(rootRef, {
    idAttribute: "data-sorter-slide-id",
    orientation: "grid",
    enabled: !readOnly,
    // the mouse too, once it travels (no HTML5 drag: Safari's could stay
    // stuck to the pointer)
    mouse: true,
    movingIds: (slideId) => dragGroupIds(order, selected, slideId),
    onReorder: ({ ids, targetId, position }) => {
      onReorder(reorderIds(order, ids, targetId, position), ids[0]!, { ids, targetId, position });
    },
  });


  // What a cell does when pressed, read then (the last committed render's),
  // so a cell is drawn again only when what it shows changes: a click in a long
  // deck's sorter reconciled every cell, its thumbnail and labels again.
  const cellActions = useRef<SorterCellActions<S> | null>(null);
  useLayoutEffect(() => {
    cellActions.current = {
      click: (slide, event) => {
        // a finger's double tap opens the slide, as the mouse's double-click
        // does (an iPad may not send dblclick at all)
        if (isDoubleTap(event.nativeEvent, slide.id)) {
          onOpen(slide.id);
          return;
        }
        select(slide.id, {
          shift: event.shiftKey,
          meta: event.metaKey || event.ctrlKey,
        });
      },
      open: (slide) => onOpen(slide.id),
      keyDown: (slide, event) => onKeyDown(event, slide.id),
      contextMenu: (slide, event) => {
        event.preventDefault();
        if (!selected.has(slide.id)) select(slide.id, {});
        onContextMenu(slide.id, event.clientX, event.clientY, menuTargets(slide.id));
      },
    };
  });
  // Each cell's accessible name (a translation each), made when the slides,
  // their numbers or the labels change, not at every selection.
  const cellLabels = useMemo(() => {
    const byId = new Map<string, string>();
    for (const group of groups) {
      for (const slide of group.slides) {
        const number = numberOf.get(slide.id) ?? 0;
        const title = slide.title.trim() || labels.untitled;
        byId.set(slide.id, `${labels.slide(number, title)}${isHidden(slide) ? `, ${labels.hidden}` : ""}`);
      }
    }
    return byId;
  }, [groups, isHidden, labels, numberOf]);

  return (
    <div
      ref={rootRef}
      className={styles.sorter}
      role="region"
      aria-label={labels.region}
      data-testid="presentation-sorter"
    >
      {groups.map((group) => {
        const section = group.section;
        const collapsed = section ? collapsedSections.has(section.id) : false;
        return (
          <section
            key={section ? `section-${section.id}` : "section-default"}
            className={styles.section}
            data-testid={
              section
                ? `presentation-sorter-section-${section.id}`
                : "presentation-sorter-section-default"
            }
          >
            {section ? (
              <button
                type="button"
                className={styles.sectionHeader}
                aria-expanded={!collapsed}
                data-testid="presentation-sorter-section-header"
                onClick={() => onToggleSection(section.id)}
                onContextMenu={(event) => {
                  if (!onSectionContextMenu) return;
                  event.preventDefault();
                  onSectionContextMenu(section.id, event.clientX, event.clientY);
                }}
              >
                <span aria-hidden="true" className={styles.chevron} data-collapsed={collapsed ? "true" : undefined}>
                  ▾
                </span>
                <span className={styles.sectionName}>{section.name}</span>
                <span className={styles.sectionCount}>
                  {labels.sectionCount(group.slides.length)}
                </span>
              </button>
            ) : null}
            {collapsed ? null : (
              <div className={styles.grid} role="listbox" aria-multiselectable="true" aria-label={section?.name ?? labels.region}>
                {group.slides.map((slide) => {
                  const number = numberOf.get(slide.id) ?? 0;
                  return (
                    <SorterCell<S>
                      key={slide.id}
                      slide={slide}
                      number={number}
                      hidden={isHidden(slide)}
                      selected={selected.has(slide.id)}
                      current={slide.id === activeId}
                      tabbable={slide.id === (focusId ?? activeId)}
                      label={cellLabels.get(slide.id) ?? ""}
                      render={renderThumbnail}
                      actions={cellActions}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
