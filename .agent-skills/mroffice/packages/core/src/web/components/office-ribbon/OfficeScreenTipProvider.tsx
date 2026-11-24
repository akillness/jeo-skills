"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * ScreenTips for an editor's whole chrome — the ribbon (base and contextual
 * tabs), the quick-access rail, the status bar and task panes — without
 * wiring a single call site.
 *
 * The editor mounts one provider for its scope ("presentation" / "document")
 * and marks its chrome regions with `data-office-screen-tips="<scope>"`
 * (`useOfficeScreenTipRegion()` gives the shared status bar and task pane the
 * attribute). One set of document listeners then shows the shared card
 * (`officeScreenTip.ts`) for any control inside a marked region: its name from
 * the control's own accessible name, its sentence from the scope's ScreenTip
 * table by the control's `data-control-id` / `data-testid`, and a greyed
 * control's reason under it. A control the table does not describe still shows
 * its name, so the native tooltip never shows alongside. A finger cannot
 * hover: a press and hold (lib/touch-hold) shows the same card through
 * `registerOfficeScreenTipDescriber`, and never presses the control.
 *
 * A region marked `data-office-screen-tip-controls="buttons"` (a task pane)
 * tips only its buttons. Controls inside a menu, list box or popup dialog
 * opened from the chrome keep their own tooltips (Office's menus show none),
 * as do ribbon tabs and content a region hosts (a contenteditable). `data-office-screen-tip="off"` opts a
 * control or a subtree out.
 */

import { useLocale } from "../../../host/next-intl";
import { createContext, useContext, useEffect, type ReactNode } from "react";

import {
  hideOfficeScreenTip,
  OFFICE_SCREEN_TIP_HOVER_DELAY_MS,
  officeScreenTipTarget,
  registerOfficeScreenTipDescriber,
  showOfficeScreenTip,
  type OfficeScreenTipContent,
  type OfficeScreenTipDescription,
} from "./officeScreenTip";
import {
  loadOfficeScreenTipResolver,
  type OfficeScreenTipResolver,
  type OfficeScreenTipScope,
} from "../../lib/office-screen-tips";

export const OFFICE_SCREEN_TIP_REGION_ATTRIBUTE = "data-office-screen-tips";
const OWNER = "office-screen-tip-provider";
const CARD_TEST_ID = "office-screen-tip";

/** The elements that are controls of their own (each gets one card). */
export const OFFICE_SCREEN_TIP_CONTROL_SELECTOR = [
  "button",
  '[role="button"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
  'input:not([type="hidden"]):not([type="file"])',
  "select",
].join(", ");

/** Popups a region opens in place: their items keep their own tooltips. */
const POPUP_ROLES = new Set(["menu", "menubar", "listbox", "dialog", "alertdialog", "tree", "grid", "tooltip"]);

interface ScopeEntry {
  count: number;
  resolver: OfficeScreenTipResolver | null;
}

const scopes = new Map<string, ScopeEntry>();
let listenerCount = 0;
let unregisterDescriber: (() => void) | null = null;

/** The control a pointer/focus target stands for, with its region's scope. */
export function officeScreenTipControlOf(
  node: EventTarget | null,
): { element: HTMLElement; region: Element; scope: string } | null {
  if (!(node instanceof Element)) return null;
  const region = node.closest(`[${OFFICE_SCREEN_TIP_REGION_ATTRIBUTE}]`);
  const scope = region?.getAttribute(OFFICE_SCREEN_TIP_REGION_ATTRIBUTE);
  if (!region || !scope) return null;
  // A task pane tips only its buttons, not the fields of its form.
  const selector =
    region.getAttribute("data-office-screen-tip-controls") === "buttons"
      ? 'button, [role="button"]'
      : OFFICE_SCREEN_TIP_CONTROL_SELECTOR;
  const element = node.closest(selector);
  if (!(element instanceof HTMLElement) || !region.contains(element)) return null;
  if (element.getAttribute("role") === "tab" || element.isContentEditable) return null;
  for (let at: Element | null = element; at; at = at.parentElement) {
    if (at.getAttribute("data-office-screen-tip") === "off") return null;
    // Not shown to anyone (a hidden picker input, a collapsed copy, a task
    // pane kept mounted behind another one) — the region itself included.
    if (at.hasAttribute("hidden") || at.getAttribute("aria-hidden") === "true") return null;
    if (at === region) break;
    if (at !== element && POPUP_ROLES.has(at.getAttribute("role") ?? "")) return null;
    if (at instanceof HTMLElement && at !== element && at.isContentEditable) return null;
  }
  return { element, region, scope };
}

/** The ids a control is known by, nearest first (its own, then its wrappers'). */
export function officeScreenTipControlIds(element: HTMLElement, region: Element): string[] {
  const ids: string[] = [];
  for (let at: Element | null = element; at && at !== region; at = at.parentElement) {
    // A wrapper only lends its id to the one control it wraps, not to a
    // group of siblings.
    if (at !== element && at.querySelectorAll(OFFICE_SCREEN_TIP_CONTROL_SELECTOR).length > 1) break;
    const controlId = at.getAttribute("data-control-id");
    const testId = at.getAttribute("data-testid");
    if (controlId) ids.push(controlId);
    if (testId) ids.push(testId);
  }
  return ids;
}

function describe(found: { element: HTMLElement; region: Element; scope: string }) {
  const resolver = scopes.get(found.scope)?.resolver;
  const content: OfficeScreenTipContent = resolver
    ? resolver(officeScreenTipControlIds(found.element, found.region))
    : {};
  const reasonHost = found.element.closest("[data-disabled-reason]");
  const disabledReason =
    reasonHost && found.region.contains(reasonHost)
      ? reasonHost.getAttribute("data-disabled-reason")?.trim() || undefined
      : undefined;
  return { element: found.element, ...content, disabledReason };
}

/** A touch hold's card (lib/touch-hold): the one a hover would show. */
function describeForHold(node: Element): OfficeScreenTipDescription | null {
  const found = officeScreenTipControlOf(node);
  return found ? { ...describe(found), splitDisabledReason: true } : null;
}

function show(found: ReturnType<typeof officeScreenTipControlOf>, delay: number) {
  if (!found) return;
  showOfficeScreenTip(describe(found), delay, {
    testId: CARD_TEST_ID,
    splitDisabledReason: true,
    owner: OWNER,
  });
}

function hide() {
  if (officeScreenTipTarget(OWNER)) hideOfficeScreenTip(OWNER);
}

function onPointerOver(event: Event) {
  const found = officeScreenTipControlOf(event.target);
  if (!found) {
    hide();
    return;
  }
  show(found, OFFICE_SCREEN_TIP_HOVER_DELAY_MS);
}

function onPointerOut(event: Event) {
  // Leaving the window (no next target): nothing else will hide the card.
  if ((event as PointerEvent).relatedTarget === null) hide();
}

function onFocusIn(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  let keyboard = false;
  try {
    keyboard = target.matches(":focus-visible");
  } catch {
    keyboard = false;
  }
  const found = keyboard ? officeScreenTipControlOf(target) : null;
  if (found) show(found, 0);
  else hide();
}

function onKeyDown(event: Event) {
  if ((event as KeyboardEvent).key === "Escape") hide();
}

function onScroll() {
  // The control moved under a fixed card.
  hide();
}

function listen() {
  listenerCount += 1;
  if (listenerCount > 1) return;
  unregisterDescriber = registerOfficeScreenTipDescriber(describeForHold);
  document.addEventListener("pointerover", onPointerOver, true);
  document.addEventListener("pointerout", onPointerOut, true);
  document.addEventListener("pointerdown", hide, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", hide, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
}

function unlisten() {
  listenerCount -= 1;
  if (listenerCount > 0) return;
  listenerCount = 0;
  hide();
  unregisterDescriber?.();
  unregisterDescriber = null;
  document.removeEventListener("pointerover", onPointerOver, true);
  document.removeEventListener("pointerout", onPointerOut, true);
  document.removeEventListener("pointerdown", hide, true);
  document.removeEventListener("focusin", onFocusIn, true);
  document.removeEventListener("focusout", hide, true);
  document.removeEventListener("keydown", onKeyDown, true);
  document.removeEventListener("scroll", onScroll, { capture: true });
}

const ScopeContext = createContext<OfficeScreenTipScope | null>(null);

/**
 * The attribute that makes an element a ScreenTip region of the surrounding
 * provider's editor (empty outside a provider, so other editors' shared
 * status bars and panes are unchanged).
 */
export function useOfficeScreenTipRegion(): { [OFFICE_SCREEN_TIP_REGION_ATTRIBUTE]?: string } {
  const scope = useContext(ScopeContext);
  return scope ? { [OFFICE_SCREEN_TIP_REGION_ATTRIBUTE]: scope } : {};
}

export function OfficeScreenTipProvider({
  scope,
  children,
}: {
  scope: OfficeScreenTipScope;
  children: ReactNode;
}) {
  const locale = useLocale();
  useEffect(() => {
    const entry = scopes.get(scope) ?? { count: 0, resolver: null };
    entry.count += 1;
    scopes.set(scope, entry);
    listen();
    return () => {
      unlisten();
      entry.count -= 1;
      if (entry.count <= 0) scopes.delete(scope);
    };
  }, [scope]);
  useEffect(() => {
    let live = true;
    void loadOfficeScreenTipResolver(scope, locale).then((resolver) => {
      const entry = scopes.get(scope);
      if (live && entry) entry.resolver = resolver;
    });
    return () => {
      live = false;
    };
  }, [scope, locale]);
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}
