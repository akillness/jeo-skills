/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Office's enhanced ScreenTip — the small card a ribbon command shows after a
 * short hover: the command's name (and shortcut) in bold, then a sentence on
 * what it does, and for a greyed command the reason it cannot act now.
 *
 * One card for every editor. The Spreadsheet ribbon (XLS-A106) drives it from
 * its own ribbon root; Presentation and Docs drive it through
 * `OfficeScreenTipProvider`, which watches the chrome regions each editor
 * marks. The card is a single fixed element under `document.body`, built
 * imperatively, so a hover never re-renders the editor that owns the control.
 *
 * Behaviour (shared by all callers): Office's half-second hover delay, shown at
 * once on keyboard focus (`:focus-visible`), dismissed by a press, Escape,
 * blur or leaving the control. While the card stands for a control, that
 * control's native `title` is taken off so two tooltips never show; it comes
 * back when the card goes. The control's own accessible name is unchanged.
 */

import styles from "./OfficeScreenTip.module.css";

export interface OfficeScreenTipContent {
  /** One sentence on what the command does. */
  description?: string;
  /** A keyboard shortcut printed after the name, e.g. "Ctrl+B". */
  shortcut?: string;
}

export interface OfficeScreenTipTarget extends OfficeScreenTipContent {
  element: HTMLElement;
  /** Why a greyed command cannot act now (shown under the description). */
  disabledReason?: string;
}

export interface OfficeScreenTipShowOptions {
  /** The card's test id (the Spreadsheet keeps `spreadsheet-ribbon-screen-tip`). */
  testId: string;
  /**
   * Read the control's name without the ": <reason>" its accessible name
   * carries while greyed (the reason has a line of its own in the card).
   */
  splitDisabledReason?: boolean;
  




  owner?: string;
}

/**
 * What a control's card says, for a caller that shows it on its own terms —
 * a touch hold (lib/touch-hold), which cannot hover: "press and hold to
 * learn" shows the same card a mouse gets after resting on the control.
 */
export interface OfficeScreenTipDescription extends OfficeScreenTipTarget {
  /** As `OfficeScreenTipShowOptions.splitDisabledReason`. */
  splitDisabledReason?: boolean;
}

/** Answers for the controls its driver tips on hover (null: not one of them). */
export type OfficeScreenTipDescriber = (node: Element) => OfficeScreenTipDescription | null;

const describers = new Set<OfficeScreenTipDescriber>();

/**
 * A hover driver (the Docs/PPT provider, the Spreadsheet ribbon) lends its
 * lookup so a hold shows the card it would. Returns the unregister function.
 */
export function registerOfficeScreenTipDescriber(describer: OfficeScreenTipDescriber): () => void {
  describers.add(describer);
  return () => {
    describers.delete(describer);
  };
}

/** The card a hover driver would show for this node's control, if any. */
export function describeOfficeScreenTip(node: Element): OfficeScreenTipDescription | null {
  for (const describer of describers) {
    const found = describer(node);
    if (found) return found;
  }
  return null;
}

/** Office's ScreenTip delay for a pointer hover. */
export const OFFICE_SCREEN_TIP_HOVER_DELAY_MS = 500;

/** The bold first line of a ScreenTip: the control's name, then its shortcut. */
export function officeScreenTipTitle(
  element: HTMLElement,
  shortcut: string | undefined,
  options: { splitDisabledReason?: boolean; stashedTitle?: string } = {},
): string {
  const labelled =
    options.stashedTitle ||
    element.getAttribute("title") ||
    element.getAttribute("aria-label") ||
    (element instanceof HTMLInputElement ? element.labels?.[0]?.textContent : null) ||
    element.closest("label")?.textContent ||
    element.textContent ||
    "";
  let name = labelled.replace(/\s+/g, " ").trim();
  const reason = element.getAttribute("data-disabled-reason")?.trim();
  if (options.splitDisabledReason && reason && name.endsWith(`: ${reason}`)) {
    name = name.slice(0, -(reason.length + 2)).trim();
  }
  // A title that already names its shortcut ("AutoSum (Alt+=)") keeps it.
  return shortcut && !/\([^)]*\)/.test(name) ? `${name} (${shortcut})` : name;
}

interface Stash {
  element: HTMLElement;
  title: string;
  /** The aria-label this module lent the control while its title was off. */
  lentAriaLabel: boolean;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let card: HTMLDivElement | null = null;
let cardTarget: HTMLElement | null = null;
let pendingTarget: HTMLElement | null = null;
let stash: Stash | null = null;
let currentOwner: string | undefined;

function restoreTitle() {
  const stashed = stash;
  stash = null;
  if (!stashed) return;
  const { element, title, lentAriaLabel } = stashed;
  if (!element.isConnected) return;
  if (!element.hasAttribute("title")) element.setAttribute("title", title);
  if (lentAriaLabel && element.getAttribute("aria-label") === title) element.removeAttribute("aria-label");
}

/**
 * Take the native title off while the card owns the control. A control whose
 * only name was its title keeps that name as an aria-label meanwhile.
 */
function stashTitle(element: HTMLElement) {
  if (stash?.element === element) return;
  restoreTitle();
  if (!element.hasAttribute("title")) return;
  const title = element.getAttribute("title") ?? "";
  element.removeAttribute("title");
  const named = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
  if (!named && title) element.setAttribute("aria-label", title);
  stash = { element, title, lentAriaLabel: !named && Boolean(title) };
}

/**
 * Hide the card (and cancel a pending one); the control gets its title back.
 * With `owner`, only a card that owner showed is hidden.
 */
export function hideOfficeScreenTip(owner?: string): void {
  if (owner !== undefined && owner !== currentOwner) return;
  currentOwner = undefined;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  pendingTarget = null;
  card?.remove();
  card = null;
  cardTarget = null;
  restoreTitle();
}

/** The control the card stands for (shown or pending), if any. */
export function officeScreenTipTarget(owner?: string): HTMLElement | null {
  if (owner !== undefined && owner !== currentOwner) return null;
  return cardTarget ?? pendingTarget;
}

function place(element: HTMLElement, tip: HTMLDivElement) {
  const box = element.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  let left = Math.max(8, box.left);
  if (width > 0 && viewportWidth > 0) left = Math.max(8, Math.min(left, viewportWidth - width - 8));
  let top = box.bottom + 6;
  // A control near the bottom edge (the status bar) shows its card above it.
  if (height > 0 && viewportHeight > 0 && top + height > viewportHeight - 4) {
    top = Math.max(4, box.top - 6 - height);
  }
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function render(target: OfficeScreenTipTarget, options: OfficeScreenTipShowOptions) {
  const { element } = target;
  if (!element.isConnected) return;
  const title = officeScreenTipTitle(element, target.shortcut, {
    splitDisabledReason: options.splitDisabledReason,
    stashedTitle: stash?.element === element ? stash.title : undefined,
  });
  if (!title) return;
  stashTitle(element);
  const tip = document.createElement("div");
  tip.setAttribute("role", "tooltip");
  tip.setAttribute("data-testid", options.testId);
  tip.className = styles.screenTip ?? "";
  const heading = document.createElement("strong");
  heading.className = styles.screenTipTitle ?? "";
  heading.textContent = title;
  tip.append(heading);
  if (target.description) {
    const body = document.createElement("span");
    body.className = styles.screenTipBody ?? "";
    body.textContent = target.description;
    tip.append(body);
  }
  if (target.disabledReason) {
    const reason = document.createElement("span");
    reason.className = styles.screenTipReason ?? "";
    reason.setAttribute("data-office-screen-tip-part", "reason");
    reason.textContent = target.disabledReason;
    tip.append(reason);
  }
  tip.style.left = "0px";
  tip.style.top = "0px";
  document.body.append(tip);
  place(element, tip);
  card = tip;
  cardTarget = element;
}

/**
 * Show the card for a control after `delay` ms (0 = now). Calling it again for
 * the control already shown or pending does nothing.
 */
export function showOfficeScreenTip(
  target: OfficeScreenTipTarget,
  delay: number,
  options: OfficeScreenTipShowOptions,
): void {
  if (typeof document === "undefined") return;
  if (officeScreenTipTarget() === target.element) return;
  hideOfficeScreenTip();
  currentOwner = options.owner;
  pendingTarget = target.element;
  if (delay <= 0) {
    pendingTarget = null;
    render(target, options);
    return;
  }
  timer = setTimeout(() => {
    timer = null;
    pendingTarget = null;
    render(target, options);
  }, delay);
}
