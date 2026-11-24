"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "../../../host/next-intl";

import {
  officeDialogClassName,
  officeDialogParts,
  useOfficeDialogChrome,
} from "../office-ribbon/officeDialogChrome";
import {
  MODAL_LAYER_SELECTOR,
  disableModalLayersBeneath,
} from "./modal-layers";
import { usePortalLayer } from "./portal-host";

/**
 * ConfirmDialog — controlled alert modal (U-16 / Spec §17)
 *
 * A focused, one-shot confirmation dialog for destructive or significant
 * actions. Use this when `useModal().confirm(...)` feels too ad-hoc or you
 * want a component that lives in JSX next to the related button.
 *
 * Callers own open/close state. The dialog does the keyboard handling and
 * outside-click dismiss; it does not call `onCancel` when the user presses
 * the primary action — only the primary callback fires.
 *
 * Inside an editor that provides the Office dialog chrome
 * (`OfficeDialogChromeProvider`), the same card takes that chrome, so a
 * confirmation reads like the editor's other command dialogs. Only class
 * names change; elements, test ids and keyboard handling are shared.
 */

export type ConfirmVariant = "default" | "destructive";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** A sentence, or the structured account a significant action deserves. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ConfirmVariant;
  /** If true the confirm button will be focused on open so Enter confirms. */
  autoFocusConfirm?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** A third choice between Cancel and the confirm button (WPS's close
   * prompt: 保存 / 不保存 / 取消, where 不保存 is this one). */
  secondaryAction?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  /** Disables the buttons while a choice is being carried out. */
  busy?: boolean;
  /** A notice with nothing to decline (Word's "There's no table of contents
   * to update"): OK alone; Escape and the backdrop still close it. */
  acknowledgeOnly?: boolean;
  /** The command this prompt carries out (`data-control-id`). It goes on the
   * prompt's own layer: the prompt portals away from where it is rendered,
   * so a wrapper around it is left empty. */
  controlId?: string;
}

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  confirmVariant = "default",
  acknowledgeOnly = false,
  autoFocusConfirm = true,
  onConfirm,
  onCancel,
  secondaryAction,
  busy = false,
  controlId,
}: ConfirmDialogProps) {
  const t = useTranslations("common");
  const chromeTone = useOfficeDialogChrome();
  const layer = usePortalLayer();
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);

  // Declared BEFORE the invoker effect so its cleanup (drop the focus guard,
  // release the dialogs beneath) runs before the invoker effect's cleanup
  // (hand focus back), not after it.
  useEffect(() => {
    if (!open) return;
    // The invoker is read before the dialogs beneath are made inert: inert
    // takes the focus away from an element inside them. A re-run while open
    // keeps the one read when the prompt opened.
    if (invokerRef.current === null) {
      const activeElement = document.activeElement;
      invokerRef.current =
        activeElement instanceof HTMLElement && activeElement.isConnected
          ? activeElement
          : null;
    }

    // A confirmation can open over another modal dialog (Text to Columns'
    // overwrite prompt, a PDF highlight's delete prompt). That dialog is
    // disabled while the prompt is up; a dialog opened later, over this one,
    // is not in this set and the guard below leaves the keyboard to it.
    const dialog = dialogRef.current;
    const { beneath, restore } = dialog
      ? disableModalLayersBeneath(dialog)
      : { beneath: new Set<Element>(), restore: () => {} };

    // Defer so the dialog is in the DOM before we focus. Opting out of the
    // confirm button still moves focus into the modal itself. Never re-entered
    // from a focus event its own focus() call fired.
    let focusing = false;
    const focusStart = () => {
      if (focusing) return;
      focusing = true;
      try {
        (autoFocusConfirm ? confirmBtnRef.current : dialogRef.current)?.focus();
      } finally {
        focusing = false;
      }
    };
    const id = window.setTimeout(focusStart, 0);
    // A modal owns the keyboard while it is open. A host that hands focus back
    // to its own surface a frame later (the spreadsheet grid re-focuses its
    // active cell after a ribbon command) would otherwise leave the dialog
    // showing but deaf: Enter and Escape would go to the sheet behind it.
    const onFocusIn = (event: FocusEvent) => {
      const current = dialogRef.current;
      if (!current?.isConnected) return;
      const target = event.target;
      if (target instanceof Node && current.contains(target)) return;
      const layer =
        target instanceof Element ? target.closest(MODAL_LAYER_SELECTOR) : null;
      if (layer && !beneath.has(layer)) return;
      focusStart();
    };
    // Escape belongs to this prompt. A Radix dialog beneath listens for it on
    // the document's capture phase, before the prompt's own handler, and would
    // close itself too unless the key arrives already handled.
    const claimEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof Node && dialogRef.current?.contains(target)) {
        event.preventDefault();
      }
    };
    document.addEventListener("focusin", onFocusIn);
    if (beneath.size > 0) window.addEventListener("keydown", claimEscape, true);
    return () => {
      clearTimeout(id);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("keydown", claimEscape, true);
      restore();
    };
  }, [open, autoFocusConfirm]);

  useEffect(() => {
    if (!open) return;
    return () => {
      const invoker = invokerRef.current;
      invokerRef.current = null;
      if (invoker?.isConnected) invoker.focus();
    };
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    // Excel's dialogs: Enter is the default action, Escape is Cancel
    // (Microsoft Support, "Keyboard shortcuts in Excel"). Enter is answered
    // here rather than left to the focused button's activation behaviour, so
    // it also works from the dialog card itself and from the body text.
    // `preventDefault` cancels that native activation, so the focused button
    // cannot fire a second time.
    if (
      event.key === "Enter" &&
      !event.defaultPrevented &&
      !event.nativeEvent.isComposing &&
      event.nativeEvent.keyCode !== 229
    ) {
      const target = event.target;
      const keepsNativeMeaning =
        target instanceof HTMLElement &&
        target.closest(
          "a[href], textarea, select, [contenteditable]:not([contenteditable='false'])",
        ) !== null;
      if (keepsNativeMeaning) return;
      event.preventDefault();
      event.stopPropagation();
      // Enter on a focused Cancel presses Cancel, as it does in Excel.
      if (target === cancelBtnRef.current) onCancel();
      else onConfirm();
      return;
    }
    if (event.key !== "Tab" || event.defaultPrevented) return;

    const focusables = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ).filter(
      (candidate) =>
        !candidate.hidden &&
        candidate.tabIndex >= 0 &&
        candidate.getAttribute("aria-hidden") !== "true" &&
        candidate.getAttribute("aria-disabled") !== "true",
    );
    if (focusables.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }

    const activeElement = document.activeElement;
    const activeIndex =
      activeElement instanceof HTMLElement
        ? focusables.indexOf(activeElement)
        : -1;
    const nextTarget = event.shiftKey
      ? activeIndex <= 0
        ? focusables[focusables.length - 1]
        : null
      : activeIndex === -1 || activeIndex === focusables.length - 1
        ? focusables[0]
        : null;
    if (!nextTarget) return;
    event.preventDefault();
    nextTarget.focus();
  };

  if (!open) return null;

  const destructive = confirmVariant === "destructive";
  const officeChrome = chromeTone !== null;

  // Over the console, where every other dialog opens (components/ui/dialog):
  // drawn in place, the fixed overlay was confined to the nearest ancestor
  // that makes a containing block for fixed boxes, so a prompt raised from an
  // editor's Ribbon (its backdrop-filter) opened inside the Ribbon, dimming
  // only the Ribbon (Docs' "There's no table of contents to update").
  const host =
    layer ??
    (typeof document === "undefined"
      ? null
      : ((document.querySelector("[data-theme='console']") as HTMLElement | null) ??
        document.body));
  const overlay = (
    <div
      className="app-modal-overlay"
      role="presentation"
      onClick={onCancel}
      data-testid="confirm-dialog-overlay"
      data-control-id={controlId}
      data-motion-surface="dim"
      // A dialog beneath treats a press on this layer, backdrop included, as
      // this prompt's, not as a click outside itself (components/ui/dialog).
      data-modal-layer=""
      // A Radix modal beneath sets `pointer-events: none` on <body>; the
      // prompt over it must still take the click.
      style={{ pointerEvents: "auto" }}
    >
      <div
        ref={dialogRef}
        className={
          officeChrome
            ? officeDialogClassName({ tone: chromeTone, size: "md" })
            : "app-modal"
        }
        // An Office card leaves with the Office dialog motion; the plain
        // card with the site's (lib/surface-motion).
        data-motion-surface={officeChrome ? undefined : "dialog"}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={body ? "confirm-dialog-body" : undefined}
        data-testid="confirm-dialog"
        tabIndex={-1}
      >
        <p
          id="confirm-dialog-title"
          className={officeChrome ? officeDialogParts.title : "app-modal-message"}
          style={officeChrome ? undefined : { fontWeight: 700 }}
        >
          {title}
        </p>
        {body ? (
          // A div, not a p: a structured body may carry its own block content.
          <div
            id="confirm-dialog-body"
            className={
              officeChrome ? officeDialogParts.message : "app-modal-message"
            }
            style={
              officeChrome
                ? undefined
                : { marginTop: 6, fontSize: "0.8125rem", opacity: 0.85 }
            }
          >
            {body}
          </div>
        ) : null}

        <div
          className={
            officeChrome ? officeDialogParts.footer : "app-modal-actions"
          }
        >
          {acknowledgeOnly ? null : (
            <button
              ref={cancelBtnRef}
              type="button"
              className={
                officeChrome
                  ? officeDialogParts.button
                  : "app-modal-btn app-modal-btn-cancel"
              }
              onClick={onCancel}
              disabled={busy}
              data-testid="confirm-dialog-cancel"
            >
              {cancelLabel ?? t("button.cancel")}
            </button>
          )}
          {secondaryAction ? (
            <button
              type="button"
              className={
                officeChrome
                  ? officeDialogParts.button
                  : "app-modal-btn app-modal-btn-cancel"
              }
              onClick={secondaryAction.onClick}
              disabled={busy}
              data-testid={secondaryAction.testId ?? "confirm-dialog-secondary"}
            >
              {secondaryAction.label}
            </button>
          ) : null}
          <button
            ref={confirmBtnRef}
            type="button"
            className={
              officeChrome
                ? officeDialogParts.primaryButton
                : "app-modal-btn app-modal-btn-confirm"
            }
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            disabled={busy}
            data-tone={officeChrome && destructive ? "danger" : undefined}
            style={
              destructive && !officeChrome
                ? {
                    background: "var(--error, #dc2626)",
                    // white in light; the dark ink on the dark themes'
                    // brightened red (white fell to ~2.6:1 there)
                    color: "var(--destructive-foreground, #fff)",
                    borderColor: "transparent",
                  }
                : undefined
            }
          >
            {confirmLabel ?? t("button.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
  return host ? createPortal(overlay, host) : overlay;
}
