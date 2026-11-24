"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useState } from "react";

import { OFFICE_DIALOG_GHOST_ATTRIBUTE } from "../../lib/office-dialog-motion";
import {
  PANEL_ENTER_MS,
  PANEL_EXIT_MS,
  SURFACE_ENTER_EASE,
  SURFACE_EXIT_EASE,
  surfaceMotionAllowed,
  surfacePictureOf,
} from "../../lib/desk-motion";

/**
 * How a task pane comes and goes (OfficeTaskPane, so every pane of every
 * editor moves the same way).
 *
 * Opening, the pane slides in from the edge it docks at (16px) and fades
 * in. Closing, a picture of it (lib/desk-motion) slides back toward that
 * edge and fades, a little quicker; the pane itself is gone at once, so the
 * keyboard leaves it and nothing in it takes a click while it goes. A pane
 * that keeps its node while closed (`hidden`) leaves the same way.
 *
 * - A dock that is its own card (Docs' right card, the workbook's column)
 *   moves as a whole when its first pane comes or its last pane goes.
 * - The room a pane takes beside the page is never animated (that would
 *   lay the editor out again on every frame): it appears with the pane, and
 *   is given back once the pane has gone (the picture keeps a dock that
 *   takes no room when empty from emptying; a host that keeps the room in
 *   its own state holds it with `useOfficeTaskPaneColumnPresence`).
 * - One pane taking another's place in the same box at once (a tab of the
 *   dock, a pane closed to reveal the one behind it, a Format pane following
 *   the selection) is a swap: it is instant, as in Office.
 */

export const OFFICE_TASK_PANE_ATTRIBUTE = "data-office-task-pane";
export const OFFICE_TASK_PANE_GHOST_ATTRIBUTE = "data-office-task-pane-ghost";
/** On a dock host: "card" (the dock draws the card) or "column". */
export const OFFICE_TASK_PANE_DOCK_ATTRIBUTE = "data-office-task-pane-dock";
/** On a dock host or a pane: the edge it docks at, "left" or "right". */
export const OFFICE_TASK_PANE_EDGE_ATTRIBUTE = "data-office-task-pane-edge";
const SLOT_ATTRIBUTE = "data-office-task-pane-slot";

/** How far a pane travels from its edge. */
const SHIFT_PX = 16;
/** Elements a pane's leaving picture copies with their contents. */
const PICTURE_BUDGET = 3000;

interface Shown {
  readonly pane: HTMLElement;
  readonly container: Element | null;
  readonly dock: HTMLElement | null;
  /** The pane's inline display while shown (a host may hide it with
   * `display: none` besides `hidden`). */
  readonly display: string;
}

interface Leaving {
  readonly pane: HTMLElement;
  readonly holder: HTMLElement;
  readonly picture: HTMLElement;
  readonly container: Element | null;
  readonly dock: HTMLElement | null;
}

/** Panes shown / gone in each box since the last flush. */
const arrived = new Map<Element, Set<HTMLElement>>();
const departed = new Map<Element, Set<HTMLElement>>();
const pendingEnters: Shown[] = [];
const pendingExits: Leaving[] = [];
let flushQueued = false;
/** The pictures still leaving each dock, and who waits for the last. */
const dockExits = new Map<Element, { pictures: Set<Element>; waiters: Set<() => void> }>();
const pictureDocks = new WeakMap<Element, Element>();

function holdDock(dock: Element, holder: Element): void {
  const exits = dockExits.get(dock) ?? { pictures: new Set<Element>(), waiters: new Set<() => void>() };
  exits.pictures.add(holder);
  dockExits.set(dock, exits);
  pictureDocks.set(holder, dock);
}

function releaseDock(holder: Element): void {
  const dock = pictureDocks.get(holder);
  if (!dock) return;
  pictureDocks.delete(holder);
  const exits = dockExits.get(dock);
  if (!exits) return;
  exits.pictures.delete(holder);
  if (exits.pictures.size > 0) return;
  dockExits.delete(dock);
  for (const waiter of exits.waiters) waiter();
}
/** The animation that faded a card dock out, kept until it is hidden. */
const dockMotions = new WeakMap<HTMLElement, Animation>();

function note(map: Map<Element, Set<HTMLElement>>, box: Element, pane: HTMLElement): void {
  const panes = map.get(box);
  if (panes) panes.add(pane);
  else map.set(box, new Set([pane]));
}

/** Whether a pane other than `pane` came or went in `box`: a swap. */
function othersIn(
  map: Map<Element, Set<HTMLElement>>,
  box: Element | null,
  pane: HTMLElement,
): boolean {
  if (!box) return false;
  const panes = map.get(box);
  return Boolean(panes && Array.from(panes).some((other) => other !== pane));
}

function dockOf(pane: Element): HTMLElement | null {
  return pane.closest<HTMLElement>(`[${OFFICE_TASK_PANE_DOCK_ATTRIBUTE}]`);
}

function slotOf(pane: Element): HTMLElement | null {
  const parent = pane.parentElement;
  return parent?.hasAttribute(SLOT_ATTRIBUTE) ? parent : null;
}

/** The box panes take each other's place in. */
function containerOf(pane: Element): Element | null {
  return dockOf(pane) ?? (slotOf(pane)?.parentElement ?? pane.parentElement);
}

/**
 * A pane in the dialogs' chrome is an `.office-dialog` card, and the dialog
 * exits (lib/office-dialog-motion) put a fading copy back for any such card
 * that leaves the document. A pane's coming and going is this module's, so
 * what a pane leaves (its node, or the slot holding only it) and the
 * pictures this module removes carry that observer's own "already a
 * picture" mark when they go, and it leaves them alone.
 */
function markLeftForDialogExits(element: Element | null): void {
  element?.setAttribute(OFFICE_DIALOG_GHOST_ATTRIBUTE, "");
}

function unmarkForDialogExits(pane: HTMLElement): void {
  pane.removeAttribute(OFFICE_DIALOG_GHOST_ATTRIBUTE);
  slotOf(pane)?.removeAttribute(OFFICE_DIALOG_GHOST_ATTRIBUTE);
}

function removePicture(holder: Element): void {
  markLeftForDialogExits(holder);
  holder.remove();
  releaseDock(holder);
}

/** +1: the pane docks at the right and comes from there; -1: the left. */
function edgeSign(element: HTMLElement): 1 | -1 {
  const declared = element
    .closest(`[${OFFICE_TASK_PANE_EDGE_ATTRIBUTE}]`)
    ?.getAttribute(OFFICE_TASK_PANE_EDGE_ATTRIBUTE);
  if (declared === "left") return -1;
  if (declared === "right") return 1;
  // Placed by its host: the side of the host's box it sits on.
  const rect = element.getBoundingClientRect();
  let reference = element.parentElement;
  for (let depth = 0; reference && depth < 8; depth += 1) {
    const box = reference.getBoundingClientRect();
    if (box.width >= rect.width * 1.5) {
      return rect.left + rect.width / 2 < box.left + box.width / 2 ? -1 : 1;
    }
    reference = reference.parentElement;
  }
  return 1;
}

/** Whether `element`, in a dock, draws anything besides leaving pictures. */
function drawsSomething(element: Element, except: Element | null): boolean {
  if (
    element === except ||
    element.hasAttribute(OFFICE_TASK_PANE_GHOST_ATTRIBUTE) ||
    element.hasAttribute(OFFICE_DIALOG_GHOST_ATTRIBUTE)
  ) {
    return false;
  }
  if (element instanceof HTMLElement && element.hidden) return false;
  if (element.hasAttribute(SLOT_ATTRIBUTE)) {
    return Array.from(element.children).some((child) => drawsSomething(child, except));
  }
  return element.getClientRects().length > 0;
}

function dockHoldsOthers(dock: HTMLElement, except: Element | null): boolean {
  return Array.from(dock.children).some((child) => drawsSomething(child, except));
}

function cancelDockMotion(dock: HTMLElement | null): void {
  if (!dock) return;
  dockMotions.get(dock)?.cancel();
  dockMotions.delete(dock);
}

/** A faded-out card dock is put back once it is hidden (or after a beat). */
function releaseDockWhenHidden(dock: HTMLElement, motion: Animation): void {
  let observer: ResizeObserver | null = null;
  let timer = 0;
  const release = () => {
    observer?.disconnect();
    window.clearTimeout(timer);
    if (dockMotions.get(dock) === motion) {
      motion.cancel();
      dockMotions.delete(dock);
    }
  };
  if (dock.getClientRects().length === 0) {
    release();
    return;
  }
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width === 0 && box.height === 0) release();
    });
    observer.observe(dock);
  }
  timer = window.setTimeout(release, 1000);
}

function slide(
  target: HTMLElement,
  sign: 1 | -1,
  direction: "in" | "out",
): Animation | null {
  if (typeof target.animate !== "function") return null;
  const away = { translate: `${sign * SHIFT_PX}px 0px`, opacity: 0 };
  const home = { translate: "0px 0px", opacity: 1 };
  try {
    return target.animate(direction === "in" ? [away, home] : [home, away], {
      duration: direction === "in" ? PANEL_ENTER_MS : PANEL_EXIT_MS,
      easing: direction === "in" ? SURFACE_ENTER_EASE : SURFACE_EXIT_EASE,
      fill: direction === "in" ? "none" : "forwards",
    });
  } catch {
    return null;
  }
}

function playExit(leaving: Leaving): void {
  const { holder, picture, dock } = leaving;
  const sign = edgeSign(picture);
  const asCard =
    dock !== null &&
    dock.getAttribute(OFFICE_TASK_PANE_DOCK_ATTRIBUTE) === "card" &&
    !dockHoldsOthers(dock, holder);
  if (asCard) cancelDockMotion(dock);
  const motion = slide(asCard ? dock : picture, sign, "out");
  if (asCard && motion) dockMotions.set(dock, motion);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    removePicture(holder);
    if (asCard && motion) releaseDockWhenHidden(dock, motion);
  };
  if (motion) {
    motion.onfinish = finish;
    motion.oncancel = finish;
  }
  // The safety net counts from the first frame that draws the exit (a busy
  // page may hold it back), and holds at most a little longer than that.
  window.requestAnimationFrame(() => window.setTimeout(finish, PANEL_EXIT_MS + 120));
  window.setTimeout(finish, PANEL_EXIT_MS + 1500);
}

function playEnter(shown: Shown): void {
  const { pane, dock } = shown;
  const asCard =
    dock !== null &&
    dock.getAttribute(OFFICE_TASK_PANE_DOCK_ATTRIBUTE) === "card" &&
    !dockHoldsOthers(dock, slotOf(pane) ?? pane);
  slide(asCard ? dock : pane, edgeSign(pane), "in");
}

function flush(): void {
  flushQueued = false;
  const enters = pendingEnters.splice(0);
  const exits = pendingExits.splice(0);
  const arrivedNow = new Map(arrived);
  const departedNow = new Map(departed);
  arrived.clear();
  departed.clear();
  for (const leaving of exits) {
    if (!leaving.holder.isConnected) {
      releaseDock(leaving.holder);
      continue;
    }
    // Another pane took its place in the same box at once: a swap is
    // instant. (The same pane shown again at once, as React's development
    // double effects do, already removed the picture.)
    if (othersIn(arrivedNow, leaving.container, leaving.pane)) {
      removePicture(leaving.holder);
      continue;
    }
    playExit(leaving);
  }
  const entered = new Set<HTMLElement>();
  for (let index = enters.length - 1; index >= 0; index -= 1) {
    const shown = enters[index];
    if (entered.has(shown.pane)) continue;
    entered.add(shown.pane);
    if (!shown.pane.isConnected || shown.pane.hidden) continue;
    if (othersIn(departedNow, shown.container, shown.pane)) continue;
    playEnter(shown);
  }
}

function schedule(): void {
  if (flushQueued) return;
  flushQueued = true;
  // After the commit that showed or removed the pane (and any update its
  // layout effects caused), before the frame is painted.
  queueMicrotask(flush);
}

/**
 * A pane has just been shown (mounted, or no longer hidden). Returns what
 * its exit needs later, or null when nothing moves here.
 */
export function noteOfficeTaskPaneShown(pane: HTMLElement): Shown | null {
  if (!surfaceMotionAllowed()) return null;
  unmarkForDialogExits(pane);
  const container = containerOf(pane);
  const dock = dockOf(pane);
  // A picture of an earlier pane still leaving this box makes way at once.
  if (container) {
    for (const child of Array.from(container.children)) {
      if (child.hasAttribute(OFFICE_TASK_PANE_GHOST_ATTRIBUTE)) removePicture(child);
    }
  }
  cancelDockMotion(dock);
  const shown: Shown = { pane, container, dock, display: pane.style.display };
  if (container) note(arrived, container, pane);
  pendingEnters.push(shown);
  schedule();
  return shown;
}

/**
 * The pane `shown` is leaving: unmounting (still drawn), or just hidden.
 * Call it from the cleanup of the effect that noted it shown.
 */
export function noteOfficeTaskPaneLeaving(shown: Shown | null): void {
  if (!shown || !surfaceMotionAllowed()) return;
  const { pane, container, dock } = shown;
  if (!pane.isConnected || !container?.isConnected) return;
  const slot = slotOf(pane);
  // What it leaves is not a dialog card leaving (see markLeftForDialogExits).
  // Only a slot that holds nothing else is marked; a pane shown again (or
  // kept, hidden) loses the mark when it is shown.
  if (pane.classList.contains("office-dialog")) {
    markLeftForDialogExits(slot && slot.childElementCount === 1 ? slot : pane);
  }
  // Its whole window is leaving: the window's own picture shows it.
  if (pane.closest("[data-window-leaving]")) return;
  // Hidden already (a pane kept mounted while closed): drawn again for the
  // picture only, inside this task, so it is never painted.
  const restore: Array<() => void> = [];
  for (
    let element: HTMLElement | null = pane;
    element && element !== container;
    element = element.parentElement
  ) {
    if (element.hidden) {
      const hiddenElement = element;
      hiddenElement.hidden = false;
      restore.push(() => {
        hiddenElement.hidden = true;
      });
    }
  }
  if (pane.style.display === "none" && shown.display !== "none") {
    pane.style.display = shown.display;
    restore.push(() => {
      pane.style.display = "none";
    });
  }
  let taken: ReturnType<typeof surfacePictureOf> | null = null;
  try {
    taken = surfacePictureOf(pane, OFFICE_TASK_PANE_GHOST_ATTRIBUTE, {
      budget: PICTURE_BUDGET,
      stripAttributes: [OFFICE_TASK_PANE_ATTRIBUTE, OFFICE_DIALOG_GHOST_ATTRIBUTE],
    });
  } finally {
    for (const undo of restore) undo();
  }
  const picture = taken.element;
  picture.removeAttribute("hidden");
  if (shown.display !== "none") picture.style.display = shown.display;
  // In a dock's slot the picture stands in a copy of the slot, so the dock's
  // rules for its panes (`dock > [slot] > *`) still place it.
  let holder: HTMLElement = picture;
  if (slot) {
    holder = slot.cloneNode(false) as HTMLElement;
    holder.removeAttribute("hidden");
    holder.removeAttribute(OFFICE_DIALOG_GHOST_ATTRIBUTE);
    holder.style.display = "contents";
    holder.setAttribute(OFFICE_TASK_PANE_GHOST_ATTRIBUTE, "");
    holder.setAttribute("aria-hidden", "true");
    holder.append(picture);
    slot.parentElement?.insertBefore(holder, slot.nextSibling);
  } else {
    pane.parentElement?.insertBefore(holder, pane.nextSibling);
  }
  if (!holder.isConnected) return;
  taken.settle();
  note(departed, container, pane);
  pendingExits.push({ pane, holder, picture, container, dock });
  if (dock) holdDock(dock, holder);
  schedule();
}

/**
 * Run `then` once no pane is seen leaving `dock` any more (at once when
 * none is). Returns a function that cancels the wait.
 */
export function afterOfficeTaskPaneExits(dock: Element | null, then: () => void): () => void {
  const exits = dock ? dockExits.get(dock) : undefined;
  if (!exits) {
    then();
    return () => {};
  }
  exits.waiters.add(then);
  return () => exits.waiters.delete(then);
}

/**
 * The room a host keeps for its task pane column in its own state (a grid
 * column, an attribute the page reads): open while `open`, and still for a
 * pane's exit after it closes, so the room is given back once the pane has
 * gone rather than under it. Never animated itself.
 */
export function useOfficeTaskPaneColumnPresence(open: boolean): boolean {
  const [seen, setSeen] = useState(open);
  const [lingering, setLingering] = useState(false);
  if (seen !== open) {
    setSeen(open);
    setLingering(!open && surfaceMotionAllowed());
  }
  useEffect(() => {
    if (!lingering) return;
    // Counted from the first frame that draws the pane's exit.
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => setLingering(false), PANEL_EXIT_MS + 60);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [lingering]);
  return open || lingering;
}
