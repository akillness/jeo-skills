/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Office's ribbon never keeps the keyboard after a mouse command: with a
 * shape selected, Bring to Front or Rotate clicked on the ribbon leaves the
 * keys on the shape, so Delete, the arrows and typing still act on it. Here a
 * ribbon control takes the focus when it is clicked (and a menu or dialog it
 * opened hands the focus back to it when it closes), so the next Delete went
 * to a ribbon button and did nothing while the object still showed selected.
 *
 * When the press that reached the ribbon started while one of the editor's
 * OBJECTS had the keys, and the focus then lands on a ribbon control without
 * a keyboard focus ring (a pointer press, or a menu or dialog closed after
 * one), the keys go back to the editor's selection once nothing the command
 * opened holds them. Typing in a text box, a field of the ribbon (a font
 * box), keyboard travel through the ribbon (Tab, key tips: the focus ring
 * shows) and a menu, popover or dialog still open all keep the keys.
 */
export interface RibbonKeysReturnOptions {
  /** Whether `element` is a control of this editor's ribbon. */
  readonly inRibbon: (element: Element) => boolean;
  /** Whether the element with the keys is one of this editor's objects. */
  readonly objectHasKeys: (active: Element | null) => boolean;
  /** Give the keys back to the editor's selection. */
  readonly returnKeys: () => void;
}

const POPUP =
  '[role="menu"],[role="listbox"],[role="dialog"][aria-modal="true"],[role="alertdialog"],[data-radix-popper-content-wrapper]';

/** A menu, popover or modal dialog still open (one closing is not). */
function popupOpen(): boolean {
  for (const element of document.querySelectorAll(POPUP)) {
    const state = element.getAttribute("data-state") ?? element.firstElementChild?.getAttribute("data-state");
    if (state !== "closed") return true;
  }
  return false;
}

function takesTyping(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "submit", "reset", "range", "color"].includes(element.type);
  }
  return (element instanceof HTMLElement && element.isContentEditable) || element.getAttribute("role") === "combobox";
}

function showsFocusRing(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

export function attachRibbonKeysReturn(options: RibbonKeysReturnOptions): () => void {
  if (typeof document === "undefined") return () => undefined;
  // Set by a press on the ribbon while an object had the keys; kept through
  // the menu, popover or dialog that press opened, cleared by a press
  // anywhere else.
  let armed = false;
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (options.inRibbon(target)) {
      armed = armed || options.objectHasKeys(document.activeElement);
      return;
    }
    if (armed && target.closest(POPUP)) return;
    armed = false;
  };
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!armed || !(target instanceof HTMLElement) || !options.inRibbon(target)) return;
    if (takesTyping(target) || showsFocusRing(target)) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!armed || document.activeElement !== target) return;
        // A menu or popover trigger still open keeps the keys; a ribbon
        // tab's own aria-expanded (its panel is shown) is no popup.
        if (
          (target.hasAttribute("aria-haspopup") && target.getAttribute("aria-expanded") === "true") ||
          popupOpen()
        ) {
          return;
        }
        armed = false;
        options.returnKeys();
      }),
    );
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("focusin", onFocusIn);
  return () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("focusin", onFocusIn);
  };
}
