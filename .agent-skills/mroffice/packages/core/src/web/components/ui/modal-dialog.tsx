"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "../../../host/next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { disableModalLayersBeneath } from "./modal-layers";

/* ── Types ─────────────────────────────────────── */

type ModalType = "prompt" | "confirm" | "alert";

interface ModalState {
  type: ModalType;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: string | boolean | null) => void;
}

interface ModalContextValue {
  prompt: (
    message: string,
    opts?: {
      defaultValue?: string;
      placeholder?: string;
      confirmLabel?: string;
      cancelLabel?: string;
    },
  ) => Promise<string | null>;
  confirm: (
    message: string,
    opts?: { confirmLabel?: string; cancelLabel?: string },
  ) => Promise<boolean>;
  alert: (message: string, opts?: { confirmLabel?: string }) => Promise<void>;
}

const ModalContext = createContext<ModalContextValue | null>(null);

/* ── Outside React ─────────────────────────────── */

// Editor commands (a slash command, a ribbon handler) run outside any
// component and used to ask through the browser's own prompt. The mounted
// provider registers itself here so they open the product's dialog instead.
let mountedModal: ModalContextValue | null = null;

/**
 * Asks for one line of text in the product's dialog. Resolves to null when
 * cancelled. Falls back to the browser's prompt only where no ModalProvider
 * is mounted.
 */
export function promptText(
  message: string,
  opts?: Parameters<ModalContextValue["prompt"]>[1],
): Promise<string | null> {
  if (mountedModal) return mountedModal.prompt(message, opts);
  if (typeof window === "undefined") return Promise.resolve(null);
  return Promise.resolve(window.prompt(message, opts?.defaultValue ?? ""));
}

/**
 * Tells the user something in the product's dialog, with one button.
 * Falls back to the browser's alert only where no ModalProvider is mounted.
 */
export function alertText(
  message: string,
  opts?: Parameters<ModalContextValue["alert"]>[1],
): Promise<void> {
  if (mountedModal) return mountedModal.alert(message, opts);
  if (typeof window !== "undefined") window.alert(message);
  return Promise.resolve();
}

/* ── Hook ──────────────────────────────────────── */

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error("useModal must be used inside <ModalProvider>");
  }
  return ctx;
}

/* ── Provider ──────────────────────────────────── */

export function ModalProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The element focused before the dialog opened — focus returns to it on close
  // so a keyboard / screen-reader user isn't dumped onto <body>.
  const triggerRef = useRef<HTMLElement | null>(null);

  // Focus management: on open, remember the trigger and move focus INTO the
  // dialog (the input for a prompt; the confirm button otherwise — without this
  // a confirm/alert has NO focused element, so the overlay's Enter/Escape
  // handler, which fires from a focused child, never runs). On close, restore
  // focus to the trigger.
  useEffect(() => {
    if (!modal) {
      const trigger = triggerRef.current;
      triggerRef.current = null;
      trigger?.focus?.();
      return;
    }
    triggerRef.current = document.activeElement as HTMLElement | null;
    // Opened over another dialog (a refusal from a settings sheet), that
    // dialog waits beneath: it must not take the focus back or close on the
    // Escape meant for this one. The trigger is read first: inert takes the
    // focus away from an element inside it.
    const { beneath, restore } = dialogRef.current
      ? disableModalLayersBeneath(dialogRef.current)
      : { beneath: new Set<Element>(), restore: () => {} };
    const claimEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof Node && dialogRef.current?.contains(target)) {
        event.preventDefault();
      }
    };
    if (beneath.size > 0) window.addEventListener("keydown", claimEscape, true);
    const id = window.setTimeout(() => {
      if (modal.type === "prompt") {
        inputRef.current?.focus();
        return;
      }
      const confirmBtn = dialogRef.current?.querySelector<HTMLElement>(
        ".app-modal-btn-confirm",
      );
      (confirmBtn ?? dialogRef.current)?.focus();
    }, 50);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", claimEscape, true);
      restore();
    };
  }, [modal]);

  const prompt = useCallback(
    (
      message: string,
      opts?: {
        defaultValue?: string;
        placeholder?: string;
        confirmLabel?: string;
        cancelLabel?: string;
      },
    ): Promise<string | null> =>
      new Promise((resolve) => {
        setInputValue(opts?.defaultValue ?? "");
        setModal({
          type: "prompt",
          message,
          defaultValue: opts?.defaultValue,
          placeholder: opts?.placeholder,
          confirmLabel: opts?.confirmLabel,
          cancelLabel: opts?.cancelLabel,
          resolve: resolve as (v: string | boolean | null) => void,
        });
        // Initial focus (input) is handled centrally by the focus-management
        // effect, alongside trigger-save + restore-on-close.
      }),
    [],
  );

  const confirm = useCallback(
    (
      message: string,
      opts?: { confirmLabel?: string; cancelLabel?: string },
    ): Promise<boolean> =>
      new Promise((resolve) => {
        setModal({
          type: "confirm",
          message,
          confirmLabel: opts?.confirmLabel,
          cancelLabel: opts?.cancelLabel,
          resolve: resolve as (v: string | boolean | null) => void,
        });
      }),
    [],
  );

  const alert = useCallback(
    (message: string, opts?: { confirmLabel?: string }): Promise<void> =>
      new Promise((resolve) => {
        setModal({
          type: "alert",
          message,
          confirmLabel: opts?.confirmLabel,
          resolve: (() => resolve()) as (v: string | boolean | null) => void,
        });
      }),
    [],
  );
  // stable: the provider sits in the workspace layout, which re-renders on
  // every route change, and every useModal() caller re-rendered with it
  const value = useMemo(() => ({ prompt, confirm, alert }), [prompt, confirm, alert]);

  const handleConfirm = useCallback(() => {
    if (!modal) return;
    if (modal.type === "prompt") {
      modal.resolve(inputValue);
    } else if (modal.type === "confirm") {
      modal.resolve(true);
    } else {
      modal.resolve(null);
    }
    setModal(null);
    setInputValue("");
  }, [modal, inputValue]);

  const handleCancel = useCallback(() => {
    if (!modal) return;
    if (modal.type === "prompt") {
      modal.resolve(null);
    } else if (modal.type === "confirm") {
      modal.resolve(false);
    } else {
      modal.resolve(null);
    }
    setModal(null);
    setInputValue("");
  }, [modal]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        // A multi-line textarea isn't used here, and Enter in the prompt input
        // means "confirm" — but don't hijack Enter while focus is on the Cancel
        // button (let the button's own activation handle it).
        e.preventDefault();
        handleConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Tab") {
        // Focus trap: keep Tab / Shift+Tab cycling inside the dialog so focus
        // can't escape to the (aria-modal) page content behind it.
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const list = Array.from(focusables);
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [handleConfirm, handleCancel],
  );

  useEffect(() => {
    const value = { prompt, confirm, alert };
    mountedModal = value;
    return () => {
      if (mountedModal === value) mountedModal = null;
    };
  }, [prompt, confirm, alert]);

  return (
    <ModalContext.Provider value={value}>
      {children}

      {modal && (
        <div
          className="app-modal-overlay"
          data-motion-surface="dim"
          onClick={handleCancel}
          onKeyDown={handleKeyDown}
          // A dialog beneath treats a press on this layer as this one's, and
          // a Radix modal beneath sets `pointer-events: none` on <body>.
          data-modal-layer=""
          style={{ pointerEvents: "auto" }}
        >
          <div
            ref={dialogRef}
            className="app-modal"
            data-motion-surface="dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-modal-message"
            tabIndex={-1}
          >
            <p id="app-modal-message" className="app-modal-message">
              {modal.message}
            </p>

            {modal.type === "prompt" && (
              <input
                ref={inputRef}
                className="app-modal-input"
                type="text"
                value={inputValue}
                placeholder={modal.placeholder}
                aria-label={modal.placeholder || modal.message}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            )}

            <div className="app-modal-actions">
              {modal.type !== "alert" && (
                <button
                  className="app-modal-btn app-modal-btn-cancel"
                  onClick={handleCancel}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    e.stopPropagation();
                    handleCancel();
                  }}
                  type="button"
                >
                  {modal.cancelLabel ?? t("button.cancel")}
                </button>
              )}
              <button
                className="app-modal-btn app-modal-btn-confirm"
                onClick={handleConfirm}
                type="button"
              >
                {modal.confirmLabel ?? t("button.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}
