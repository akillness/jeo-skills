"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type MouseEvent,
} from "react";
import { OFFICE_DIALOG_GHOST_ATTRIBUTE } from "../../lib/office-dialog-motion";

/** Class that turns a native-page-window command dialog into a centred card. */
export const NATIVE_WINDOW_MODAL_DIALOG_CLASS = "native-window__modal-dialog";

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
const FOCUSABLE_SELECTOR = `${FIELD_SELECTOR}, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])`;

function focusable(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element && !element.closest("[hidden], [inert]"));
}

/**
 * Where a dialog's keyboard starts: the control it names with
 * `data-initial-focus` (the Insert Link dialog's Address box), else its first
 * field, else its first control, else the dialog itself.
 */
function focusDialogStart(dialog: HTMLElement): void {
  const named = dialog.querySelector<HTMLElement>("[data-initial-focus]");
  const target = [
    named,
    ...Array.from(dialog.querySelectorAll<HTMLElement>(FIELD_SELECTOR)),
    ...Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)),
  ].find(focusable);
  if (target) {
    target.focus({ preventScroll: true });
    if (document.activeElement === target) return;
  }
  if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
  dialog.focus({ preventScroll: true });
}

function swallow(event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * The dimmed backdrop behind a native-page-window command dialog.
 *
 * Mounted ONCE per editor window; it shows itself whenever any dialog carrying
 * {@link NATIVE_WINDOW_MODAL_DIALOG_CLASS} is in the document, so no dialog has
 * to render or own a backdrop of its own.
 *
 * It renders IN PLACE rather than through a portal to `<body>`, which is what
 * keeps the dialog itself out of the dim. The workbench shell is
 * transform-positioned, so it is a stacking context: a dialog card inside it
 * cannot out-rank anything painted at body level however high its z-index, and
 * a portaled backdrop therefore greys the card along with the workbook. Kept in
 * the same context as the cards, the usual z-index order applies again and the
 * dim stops at the window that owns the dialog.
 *
 * It is a real element rather than a pseudo-element because every pseudo this
 * could hang off is either clipped or unpainted: a dialog that scrolls its own
 * content clips its `::before`, the window container is `overflow: hidden`,
 * `body::before` is already the themed page backdrop, and an
 * `html:has(…)::after` computes correctly but Chrome never paints it (verified
 * in a real browser — matched, `display: block`, and invisible).
 *
 * The open check runs in an effect with no dependency list: a dialog only ever
 * opens or closes through this window's own state, so every transition
 * re-renders the window, and `setState` with an unchanged value is a no-op.
 * That keeps the cost at one class lookup per render with no observer.
 *
 * The same transition owns the keyboard, as Excel's dialogs do. When a dialog
 * opens while focus is still outside it (a shortcut pressed in a cell, a
 * ribbon button), focus moves to the dialog's start, so typing and Escape
 * reach the dialog rather than the cell. When the last dialog closes,
 * `onDialogClosed` receives the element that had focus when it opened, one
 * frame later (after a dialog's own focus return), for the host to hand the
 * keyboard back to its grid.
 */
export function NativeWindowModalDimmer({
  onDialogClosed,
}: {
  readonly onDialogClosed?: (opener: HTMLElement | null) => void;
} = {}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const openedRef = useRef<{ opener: HTMLElement | null } | null>(null);
  // No dependency list by design: every window render re-checks (see above).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A dialog that is only fading out (the motion layer's copy) is closed.
    const dialog = document.querySelector<HTMLElement>(
      `.${NATIVE_WINDOW_MODAL_DIALOG_CLASS}:not([${OFFICE_DIALOG_GHOST_ATTRIBUTE}])`,
    );
    setOpen(dialog !== null);
    if (dialog && !openedRef.current) {
      const active = document.activeElement;
      openedRef.current = {
        opener:
          active instanceof HTMLElement && active !== document.body
            ? active
            : null,
      };
      if (!dialog.contains(active)) focusDialogStart(dialog);
    } else if (!dialog && openedRef.current) {
      const { opener } = openedRef.current;
      openedRef.current = null;
      if (onDialogClosed) {
        window.requestAnimationFrame(() => onDialogClosed(opener));
      }
    }
  });
  if (!open) return null;
  return (
    <div
      aria-hidden="true"
      className="native-window__modal-dimmer"
      data-testid="native-window-modal-dimmer"
      onPointerDown={swallow}
      onClick={swallow}
    />
  );
}
