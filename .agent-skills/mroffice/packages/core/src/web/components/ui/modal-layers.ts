/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Every dialog layer a prompt can open over or under: Radix dialogs, the
 * editors' native command cards, other alert dialogs. */
export const MODAL_LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"]';

/**
 * Disables the open dialogs beneath `dialog`, as a dialog is under Excel's
 * message box: their focus traps must not pull the focus back, since two
 * traps that each re-focus from inside the other's focus event recurse until
 * the stack overflows. Inert elements cannot take focus, so such a re-focus
 * becomes a no-op. A dialog opened later, over this one, is not touched.
 *
 * Returns the layers beneath and a function that gives them back.
 */
export function disableModalLayersBeneath(dialog: HTMLElement): {
  beneath: Set<Element>;
  restore: () => void;
} {
  const beneath = new Set<Element>();
  const madeInert: HTMLElement[] = [];
  for (const layer of Array.from(
    document.querySelectorAll<HTMLElement>(MODAL_LAYER_SELECTOR),
  )) {
    if (layer.contains(dialog) || dialog.contains(layer)) continue;
    beneath.add(layer);
    if (!layer.inert) {
      layer.inert = true;
      madeInert.push(layer);
    }
  }
  return {
    beneath,
    restore: () => {
      for (const layer of madeInert) layer.inert = false;
    },
  };
}
