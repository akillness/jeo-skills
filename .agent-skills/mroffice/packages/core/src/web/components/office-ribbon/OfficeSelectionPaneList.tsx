"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isDoubleTap } from "../../lib/double-tap";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronRight, Eye, EyeOff } from "./icons/houseIcons";

import styles from "./OfficeSelectionPaneList.module.css";
import { ButtonUnlessRenaming } from "../ui/ButtonUnlessRenaming";
import type { OfficeSelectionPaneMove } from "./officeSelectionPaneReorder";

export type { OfficeSelectionPaneMove } from "./officeSelectionPaneReorder";

/**
 * The Selection Pane's object list (Word / PowerPoint / Excel: Home >
 * Select > Selection Pane), shared by the editors: a list of rows, each a
 * type icon, the object's name (renamed in place), its stacking ordinal, an
 * eye that shows or hides it and, for a reorderable object, the Bring /
 * Send rail. The pane's frame is the shared OfficeTaskPane; what the rows
 * list and what their commands do stay with each editor.
 */

/** The list's class names, for a caller's own parts beside the rows. */
export const officeSelectionPaneListClassNames = styles;

/**
 * The list's reordering (Microsoft Support, "Manage objects with the
 * Selection pane"): a row dragged up or down the list changes the stacking
 * order, and Ctrl+Shift+F / Ctrl+Shift+B bring the selected rows forward /
 * send them backward. A row moves only among the rows of its own container
 * (the objects of the slide or sheet, or of one group: "for an object that's
 * in a group, you can only move it within the group"); a selected row drags
 * the container's whole selection with it. What a move does stays with the
 * editor ({@link OfficeSelectionPaneMove}).
 */
export interface OfficeSelectionPaneReorderProps {
  readonly onMove: (move: OfficeSelectionPaneMove) => void;
  /** Alt+Shift+9 expands every group, Alt+Shift+1 collapses them. */
  readonly onExpandAll?: (expanded: boolean) => void;
  /** Screen-reader help naming the drag and the keys. */
  readonly hint?: string;
}

/** A row's place in the drag: its unit, its container and whether it moves. */
export interface OfficeSelectionPaneDragRow {
  /** The unit the row stands for (an object, or a whole group). */
  readonly key: string;
  /** The rows it moves among ("" for the slide's / sheet's own objects). */
  readonly container: string;
  /** False: listed, never moved (Word's inline objects, a locked object). */
  readonly movable: boolean;
}

/** Movement past which a press on a row becomes a drag. */
const DRAG_START_PX = 4;
/** A finger drags after holding still this long (it scrolls otherwise). */
const TOUCH_HOLD_MS = 350;
const TOUCH_SLOP_PX = 8;
/** Distance from the list's edge at which a drag scrolls it. */
const AUTO_SCROLL_EDGE_PX = 24;

interface DragSession {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly startY: number;
  readonly startX: number;
  readonly row: HTMLLIElement;
  readonly key: string;
  readonly container: string;
  active: boolean;
  keys: readonly string[];
  slot: number | null;
  holdTimer: number | null;
}

function paneRows(list: HTMLElement): HTMLLIElement[] {
  return [...list.children].filter(
    (child): child is HTMLLIElement => child instanceof HTMLLIElement && child.dataset.paneUnit !== undefined,
  );
}

function containerRows(list: HTMLElement, container: string): HTMLLIElement[] {
  return paneRows(list).filter((row) => row.dataset.paneContainer === container);
}

/** The last row a unit's row covers: itself and the rows nested under it. */
function unitEnd(row: HTMLLIElement): HTMLLIElement {
  const level = Number(row.dataset.paneLevel ?? 0);
  let end = row;
  for (let next = row.nextElementSibling; next instanceof HTMLLIElement; next = next.nextElementSibling) {
    if (Number(next.dataset.paneLevel ?? 0) <= level) break;
    end = next;
  }
  return end;
}

/** The units moving with `row`: the container's selection when the row is in it. */
function movingKeys(list: HTMLElement, row: HTMLLIElement): string[] {
  const key = row.dataset.paneUnit ?? "";
  if (row.dataset.paneSelected !== "true") return [key];
  const selected = containerRows(list, row.dataset.paneContainer ?? "")
    .filter((candidate) => candidate.dataset.paneSelected === "true" && candidate.dataset.paneMovable === "true")
    .map((candidate) => candidate.dataset.paneUnit ?? "");
  return selected.includes(key) ? selected : [key];
}

function clearDropMarks(list: HTMLElement) {
  for (const row of paneRows(list)) {
    delete row.dataset.dropBefore;
    delete row.dataset.dropAfter;
    delete row.dataset.dragging;
  }
  delete list.dataset.dragging;
}

export function OfficeSelectionPaneList({
  isEmpty,
  emptyLabel,
  emptyTestId,
  listLabel,
  reorder,
  children,
}: {
  readonly isEmpty: boolean;
  readonly emptyLabel: ReactNode;
  readonly emptyTestId?: string;
  /** The list's accessible name. */
  readonly listLabel: string;
  /** Drag and keyboard reordering; without it the rows only list. */
  readonly reorder?: OfficeSelectionPaneReorderProps | null;
  /** The OfficeSelectionPaneRow items. */
  readonly children?: ReactNode;
}): React.JSX.Element {
  const listRef = useRef<HTMLUListElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const swallowClickRef = useRef(false);
  const hintId = useId();

  const endSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session?.holdTimer !== null && session?.holdTimer !== undefined) {
      window.clearTimeout(session.holdTimer);
    }
    if (listRef.current) clearDropMarks(listRef.current);
  }, []);

  // A finger's drag must not scroll the list under it: once the drag holds
  // the row, its touch moves are the drag's (a non-passive listener, the one
  // way to keep a browser from panning).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const onTouchMove = (event: TouchEvent) => {
      if (sessionRef.current?.active && event.cancelable) event.preventDefault();
    };
    list.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => list.removeEventListener("touchmove", onTouchMove);
  }, [isEmpty]);

  useEffect(() => endSession, [endSession]);

  const focusUnit = useCallback((key: string | undefined) => {
    if (!key) return;
    window.requestAnimationFrame(() => {
      const list = listRef.current;
      const row = list ? paneRows(list).find((candidate) => candidate.dataset.paneUnit === key) : undefined;
      row?.querySelector<HTMLElement>("[data-pane-row]")?.focus({ preventScroll: true });
    });
  }, []);

  const placeDrop = useCallback((session: DragSession, clientY: number) => {
    const list = listRef.current;
    if (!list) return;
    clearDropMarks(list);
    list.dataset.dragging = "true";
    const moving = new Set(session.keys);
    const rows = containerRows(list, session.container);
    for (const row of rows) if (moving.has(row.dataset.paneUnit ?? "")) row.dataset.dragging = "true";
    const rest = rows.filter((row) => !moving.has(row.dataset.paneUnit ?? ""));
    let slot = 0;
    for (const row of rest) {
      const box = row.getBoundingClientRect();
      if (clientY > box.top + box.height / 2) slot += 1;
      else break;
    }
    session.slot = slot;
    const before = rest[slot];
    const last = rest[rest.length - 1];
    if (before) before.dataset.dropBefore = "true";
    else if (last) unitEnd(last).dataset.dropAfter = "true";
    // Near the list's edge the drag scrolls it, to reach rows out of view.
    const body = bodyRef.current;
    if (body && body.scrollHeight > body.clientHeight) {
      const frame = body.getBoundingClientRect();
      if (clientY < frame.top + AUTO_SCROLL_EDGE_PX) body.scrollTop -= 8;
      else if (clientY > frame.bottom - AUTO_SCROLL_EDGE_PX) body.scrollTop += 8;
    }
  }, []);

  const activate = useCallback(
    (session: DragSession, clientY: number) => {
      const list = listRef.current;
      if (!list || session.row.dataset.paneMovable !== "true") {
        endSession();
        return;
      }
      session.active = true;
      session.keys = movingKeys(list, session.row);
      try {
        list.setPointerCapture(session.pointerId);
      } catch {
        // The pointer may already be gone (a finger lifted as the hold fired).
      }
      placeDrop(session, clientY);
    },
    [endSession, placeDrop],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLUListElement>) => {
    if (!reorder || event.button !== 0 || sessionRef.current) return;
    const target = event.target as HTMLElement;
    // Only the row itself drags: its eye, its rail and a rename field act.
    const rowButton = target.closest<HTMLElement>("[data-pane-row]");
    if (!rowButton || target.closest("input")) return;
    const row = rowButton.closest<HTMLLIElement>("li[data-pane-unit]");
    if (!row || row.parentElement !== listRef.current || row.dataset.paneMovable !== "true") return;
    const session: DragSession = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      row,
      key: row.dataset.paneUnit ?? "",
      container: row.dataset.paneContainer ?? "",
      active: false,
      keys: [],
      slot: null,
      holdTimer: null,
    };
    if (event.pointerType === "touch") {
      const clientY = event.clientY;
      session.holdTimer = window.setTimeout(() => {
        session.holdTimer = null;
        if (sessionRef.current === session) activate(session, clientY);
      }, TOUCH_HOLD_MS);
    }
    sessionRef.current = session;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLUListElement>) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    if (!session.active) {
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (session.pointerType === "touch") {
        // A finger that moves before the hold scrolls the list.
        if (distance > TOUCH_SLOP_PX) endSession();
        return;
      }
      if (Math.abs(event.clientY - session.startY) < DRAG_START_PX) return;
      activate(session, event.clientY);
      return;
    }
    event.preventDefault();
    placeDrop(session, event.clientY);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLUListElement>) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    const dropped = session.active ? session : null;
    endSession();
    if (!dropped || dropped.slot === null) return;
    // The click that ends a drag is not a click on the row.
    swallowClickRef.current = true;
    window.setTimeout(() => {
      swallowClickRef.current = false;
    }, 0);
    reorder?.onMove({
      kind: "drop",
      keys: dropped.keys,
      container: dropped.container,
      slot: dropped.slot,
    });
    focusUnit(dropped.key);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    const list = listRef.current;
    if (!list) return;
    if (event.key === "Escape" && sessionRef.current) {
      event.preventDefault();
      event.stopPropagation();
      endSession();
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("input")) return;
    const row = target.closest<HTMLLIElement>("li[data-pane-unit]");
    if (!row || row.parentElement !== list) return;
    const reorderProps = reorder;
    const mod = event.ctrlKey || event.metaKey;
    const letter = event.code.startsWith("Key") ? event.code.slice(3) : event.key.toUpperCase();
    if (reorderProps && mod && event.shiftKey && !event.altKey && (letter === "F" || letter === "B")) {
      // Ctrl+Shift+F brings forward, Ctrl+Shift+B sends backward, the
      // selected rows of the focused row's container (the focused row alone
      // when it is not selected).
      event.preventDefault();
      event.stopPropagation();
      if (row.dataset.paneMovable !== "true") return;
      const key = row.dataset.paneUnit ?? "";
      reorderProps.onMove({
        kind: "step",
        keys: movingKeys(list, row),
        container: row.dataset.paneContainer ?? "",
        direction: letter === "F" ? "forward" : "backward",
      });
      focusUnit(key);
      return;
    }
    if (mod && event.shiftKey && !event.altKey && letter === "S") {
      // Ctrl+Shift+S: the focused row's visibility (PowerPoint for the web
      // toggles it).
      const eye = row.querySelector<HTMLButtonElement>("[data-pane-visibility]");
      if (eye && !eye.disabled) {
        event.preventDefault();
        event.stopPropagation();
        eye.click();
      }
      return;
    }
    if (reorderProps?.onExpandAll && event.altKey && event.shiftKey && (event.code === "Digit9" || event.code === "Digit1")) {
      event.preventDefault();
      event.stopPropagation();
      reorderProps.onExpandAll(event.code === "Digit9");
      return;
    }
    if (event.defaultPrevented || mod || event.altKey) return;
    // The arrows walk the rows (an editor that walks them itself has
    // already taken the key); Left from a group's object goes to its group,
    // Right from an open group to its first object.
    const rows = paneRows(list);
    const at = rows.indexOf(row);
    const level = Number(row.dataset.paneLevel ?? 0);
    let next: HTMLLIElement | undefined;
    if (event.key === "ArrowDown") next = rows[at + 1];
    else if (event.key === "ArrowUp") next = rows[at - 1];
    else if (event.key === "Home") next = rows[0];
    else if (event.key === "End") next = rows[rows.length - 1];
    else if (event.key === "ArrowLeft" && level > 0) {
      next = rows.slice(0, at).reverse().find((candidate) => Number(candidate.dataset.paneLevel ?? 0) < level);
    } else if (event.key === "ArrowRight") {
      const below = rows[at + 1];
      if (below && Number(below.dataset.paneLevel ?? 0) > level) next = below;
    }
    const button = next?.querySelector<HTMLElement>("[data-pane-row]");
    if (!button) return;
    event.preventDefault();
    button.focus({ preventScroll: false });
  };

  return (
    <div className={styles.body} ref={bodyRef}>
      {reorder?.hint && !isEmpty ? (
        <span id={hintId} className="sr-only">
          {reorder.hint}
        </span>
      ) : null}
      {isEmpty ? (
        <p className={styles.empty} data-testid={emptyTestId}>
          {emptyLabel}
        </p>
      ) : (
        // The explicit role keeps the list a list for VoiceOver, which drops
        // list semantics from a `list-style: none` list.
        <ul
          ref={listRef}
          className={styles.list}
          role="list"
          aria-label={listLabel}
          aria-describedby={reorder?.hint ? hintId : undefined}
          data-reorderable={reorder ? "true" : undefined}
          onPointerDown={reorder ? onPointerDown : undefined}
          onPointerMove={reorder ? onPointerMove : undefined}
          onPointerUp={reorder ? onPointerUp : undefined}
          onPointerCancel={reorder ? endSession : undefined}
          onLostPointerCapture={(event) => {
            if (sessionRef.current?.active && event.pointerId === sessionRef.current.pointerId) endSession();
          }}
          onClickCapture={(event) => {
            if (!swallowClickRef.current) return;
            swallowClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={onKeyDown}
        >
          {children}
        </ul>
      )}
    </div>
  );
}

export interface OfficeSelectionPaneRename {
  readonly draft: string;
  readonly inputLabel: string;
  readonly testId?: string;
  readonly maxLength?: number;
  readonly onChange: (draft: string) => void;
  /** Enter or leaving the field. */
  readonly onCommit: () => void;
  /** Escape. */
  readonly onCancel: () => void;
}

export interface OfficeSelectionPaneVisibility {
  readonly hidden: boolean;
  readonly disabled?: boolean;
  readonly title: string;
  readonly ariaLabel: string;
  readonly testId?: string;
  readonly onToggle: () => void;
}

export interface OfficeSelectionPaneReorderAction {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
  readonly testId?: string;
  readonly onClick: () => void;
}

/** A group row's disclosure: PowerPoint's pane expands a group (Right arrow)
 * to list its objects and collapses it (Left arrow). */
export interface OfficeSelectionPaneExpansion {
  readonly expanded: boolean;
  readonly label: string;
  readonly testId?: string;
  readonly onToggle: () => void;
}

export interface OfficeSelectionPaneRowProps {
  /** The row button, for the pane's roving focus. */
  readonly rowRef?: (element: HTMLButtonElement | null) => void;
  readonly icon: ReactNode;
  readonly label: string;
  /** The row's hover text, when it says more than the name. */
  readonly title?: string;
  /** The name's own test id (a click on it selects, a double-click renames). */
  readonly labelTestId?: string;
  /** The row's place in the list, for a list the editor pages or groups. */
  readonly position?: { readonly index: number; readonly setSize: number };
  /** A screen-reader description of the row (its order, why it is locked). */
  readonly description?: { readonly id: string; readonly text: string } | null;
  readonly ordinal?: ReactNode;
  readonly selected: boolean;
  /** The primary (last clicked) selection: aria-current. */
  readonly current?: boolean;
  readonly hidden?: boolean;
  /** Widens the row's grid for the reorder rail column. */
  readonly reorderable?: boolean;
  readonly tabIndex?: number;
  readonly testId?: string;
  /** Extra data-* attributes on the row button (data-object-type). */
  readonly rowData?: Readonly<Record<`data-${string}`, string | undefined>>;
  readonly onFocus?: () => void;
  readonly onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  readonly onKeyDown?: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  /** Double-click on the name (start renaming). */
  readonly onLabelDoubleClick?: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  /** While set, the name is an input. */
  readonly rename?: OfficeSelectionPaneRename | null;
  /** The eye; null keeps its column empty (an object that cannot hide). */
  readonly visibility?: OfficeSelectionPaneVisibility | null;
  /** The Bring / Send rail; null or empty omits it. */
  readonly reorder?: {
    readonly label: string;
    readonly actions: readonly OfficeSelectionPaneReorderAction[];
  } | null;
  /** Nesting depth in a pane that lists groups' objects (0 = the slide's own);
   * a pane that sets it on every row keeps room for the disclosure arrow. */
  readonly level?: number;
  /** The group row's expand / collapse arrow. */
  readonly expansion?: OfficeSelectionPaneExpansion | null;
  /** The row's place in the list's drag (OfficeSelectionPaneList `reorder`). */
  readonly drag?: OfficeSelectionPaneDragRow | null;
}

export function OfficeSelectionPaneRow({
  rowRef,
  icon,
  label,
  title,
  labelTestId,
  position,
  description,
  ordinal,
  selected,
  current,
  hidden,
  reorderable,
  tabIndex,
  testId,
  rowData,
  onFocus,
  onClick,
  onKeyDown,
  onLabelDoubleClick,
  rename,
  visibility,
  reorder,
  level,
  expansion,
  drag,
}: OfficeSelectionPaneRowProps): React.JSX.Element {
  return (
    <li
      className={styles.item}
      aria-posinset={position?.index}
      aria-setsize={position?.setSize}
      data-hidden={hidden || undefined}
      data-reorderable={reorderable ? "true" : undefined}
      data-pane-unit={drag?.key}
      data-pane-container={drag ? drag.container : undefined}
      data-pane-movable={drag ? (drag.movable ? "true" : "false") : undefined}
      data-pane-selected={drag ? (selected ? "true" : "false") : undefined}
      data-pane-level={drag ? String(level ?? 0) : undefined}
    >
      {description ? (
        <span id={description.id} className="sr-only">
          {description.text}
        </span>
      ) : null}
      <ButtonUnlessRenaming
        renaming={Boolean(rename)}
        ref={rowRef}
        type="button"
        className={styles.row}
        data-pane-row="true"
        data-selected={selected || undefined}
        {...rowData}
        data-testid={testId}
        aria-current={current ? "true" : undefined}
        aria-pressed={selected}
        aria-expanded={expansion ? expansion.expanded : undefined}
        aria-describedby={description?.id}
        data-level={level === undefined ? undefined : String(level)}
        style={level === undefined ? undefined : ({ "--pane-indent": `${level * 18}px` } as CSSProperties)}
        tabIndex={tabIndex}
        title={title ?? label}
        onFocus={onFocus}
        onClick={onClick}
        onKeyDown={(event) => {
          if (expansion && !rename) {
            if (event.key === "ArrowRight" && !expansion.expanded) {
              event.preventDefault();
              event.stopPropagation();
              expansion.onToggle();
              return;
            }
            if (event.key === "ArrowLeft" && expansion.expanded) {
              event.preventDefault();
              event.stopPropagation();
              expansion.onToggle();
              return;
            }
          }
          onKeyDown?.(event);
        }}
      >
        {expansion ? (
          // Not a second button inside the row: the arrow keys reach it from
          // the keyboard, and a click on the arrow only toggles.
          <span
            className={styles.disclosure}
            data-expanded={expansion.expanded ? "true" : "false"}
            data-testid={expansion.testId}
            title={expansion.label}
            aria-hidden
            onClick={(event) => {
              event.stopPropagation();
              expansion.onToggle();
            }}
          >
            <ChevronRight size={12} aria-hidden />
          </span>
        ) : null}
        <span className={styles.icon}>{icon}</span>
        {rename ? (
          <input
            className={styles.label}
            autoFocus
            value={rename.draft}
            maxLength={rename.maxLength ?? 255}
            aria-label={rename.inputLabel}
            data-testid={rename.testId}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => rename.onChange(event.target.value)}
            onBlur={rename.onCommit}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                rename.onCommit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                rename.onCancel();
              }
            }}
          />
        ) : (
          <span
            className={styles.label}
            data-testid={labelTestId}
            onDoubleClick={onLabelDoubleClick}
            // A finger's double tap renames as a double-click does (an iPad
            // does not dependably send dblclick).
            onClick={
              onLabelDoubleClick
                ? (event) => {
                    if (isDoubleTap(event.nativeEvent)) onLabelDoubleClick(event);
                  }
                : undefined
            }
          >
            {label}
          </span>
        )}
        <span className={styles.ordinal}>{ordinal}</span>
      </ButtonUnlessRenaming>
      {visibility ? (
        <button
          type="button"
          className={styles.visibilityButton}
          disabled={visibility.disabled}
          aria-pressed={!visibility.hidden}
          title={visibility.title}
          aria-label={visibility.ariaLabel}
          data-testid={visibility.testId}
          data-pane-visibility="true"
          data-hidden={visibility.hidden ? "true" : "false"}
          onClick={visibility.onToggle}
        >
          {visibility.hidden ? (
            <EyeOff size={14} aria-hidden />
          ) : (
            <Eye size={14} aria-hidden />
          )}
        </button>
      ) : (
        <span aria-hidden />
      )}
      {reorder && reorder.actions.length > 0 ? (
        <span className={styles.reorderRail} aria-label={reorder.label}>
          {reorder.actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={styles.reorderButton}
              disabled={action.disabled}
              title={action.label}
              aria-label={action.label}
              data-testid={action.testId}
              onClick={action.onClick}
            >
              {action.icon}
            </button>
          ))}
        </span>
      ) : null}
    </li>
  );
}
