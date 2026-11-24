"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { deviceHasTouch, isTouchLikePointer } from "@mrnote/core/web/lib/pointer-capability.ts";

/**
 * View > Focus: Word leaves Focus with Esc, or from the top of the screen,
 * where moving the pointer brings back a strip of commands ("Bring focus to
 * your words", Microsoft Support). Focus here is the browser's full screen of
 * the editor's frame, and the browser hit-tests only what is inside the
 * full-screen element, so the strip is placed in that frame (`container`).
 * Without one (a bare editor surface took the full screen) it falls back to
 * a manual popover in the page. Hidden, it is an 8 px band along the top
 * edge that takes no click from the page; the pointer on it shows the button.
 * A finger has no hover: on a device a finger can reach the band is a
 * finger's height, and a press on it shows the button (Esc needs a keyboard
 * an iPad seldom has).
 */
export function DocumentFocusModeExit({
  container,
  label,
  hint,
  onExit,
}: {
  /** The full-screen frame to draw the strip in, or null for the page. */
  readonly container?: HTMLElement | null;
  readonly label: string;
  readonly hint: string;
  readonly onExit: () => void;
}): React.JSX.Element | null {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [touchBand] = useState(() => deviceHasTouch());

  useEffect(() => {
    const strip = stripRef.current as (HTMLDivElement & {
      showPopover?: () => void;
      hidePopover?: () => void;
    }) | null;
    if (container || !strip || typeof strip.showPopover !== "function") return;
    try {
      strip.showPopover();
    } catch {
      // Already shown, or the browser refuses: the Esc key still exits.
    }
    return () => {
      try {
        strip.hidePopover?.();
      } catch {
        // Gone with the full screen.
      }
    };
  }, [container]);

  // The strip promises Esc. A browser's own full-screen chrome consumes the
  // key and leaves full screen, but an embedded browser (an app's web view)
  // has no such chrome and hands Esc to the page, where nothing exited
  // (WUA 066). Esc nobody else took -- not a dialog's, a menu's or an input
  // method's -- leaves Focus here too.
  const exitRef = useRef(onExit);
  useEffect(() => {
    exitRef.current = onExit;
  }, [onExit]);
  useEffect(() => {
    // ProseMirror cancels every Esc typed in the text (prosemirror-view's
    // captureKeyDown keeps the browser off Enter and Esc), so an Esc pressed
    // with the caret in the words always arrived here "taken" and Focus never
    // left (WUA 066, still open: the strip's own button exited, the text did
    // not). The editor's state as the key arrived tells the difference: an
    // Esc that a plugin used (closing a suggestion, leaving a selected
    // object) changed it; ProseMirror's blanket cancel changes nothing.
    const editorStateAtKey = new WeakMap<Event, unknown>();
    const editorStateOf = (target: EventTarget | null): unknown => {
      const surface = target instanceof Element ? target.closest(".ProseMirror") : null;
      return (surface as { editor?: { state?: unknown } } | null)?.editor?.state;
    };
    const rememberEditorState = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const state = editorStateOf(event.target);
      if (state !== undefined) editorStateAtKey.set(event, state);
    };
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      if (event.defaultPrevented) {
        const before = editorStateAtKey.get(event);
        if (before === undefined || editorStateOf(event.target) !== before) return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [popover]:not([data-testid="document-focus-mode-exit-strip"])')) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) return;
      event.preventDefault();
      exitRef.current();
    };
    document.addEventListener("keydown", rememberEditorState, true);
    document.addEventListener("keydown", exitOnEscape);
    return () => {
      document.removeEventListener("keydown", rememberEditorState, true);
      document.removeEventListener("keydown", exitOnEscape);
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={stripRef}
      // React 19 passes the attribute through as written.
      {...(container ? {} : ({ popover: "manual" } as Record<string, string>))}
      data-testid="document-focus-mode-exit-strip"
      data-revealed={revealed ? "true" : "false"}
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onPointerDown={(event) => {
        if (isTouchLikePointer(event)) setRevealed(true);
      }}
      style={{
        position: "fixed",
        inset: "0 0 auto 0",
        margin: 0,
        padding: revealed ? "6px 0 10px" : 0,
        width: "100%",
        height: revealed ? "auto" : touchBand ? 24 : 8,
        border: "none",
        background: "transparent",
        display: "flex",
        justifyContent: "center",
        overflow: "visible",
        zIndex: 2147483000,
      }}
    >
      <button
        type="button"
        data-testid="document-focus-mode-exit"
        title={hint}
        onClick={onExit}
        style={{
          visibility: revealed ? "visible" : "hidden",
          font: "inherit",
          fontSize: 13,
          padding: "6px 14px",
          borderRadius: 6,
          border: "1px solid rgb(15 23 42 / 18%)",
          background: "rgb(255 255 255 / 96%)",
          color: "#1f2937",
          boxShadow: "0 6px 18px rgb(15 23 42 / 18%)",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    </div>,
    container ?? document.body,
  );
}
