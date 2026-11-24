"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The equation edited IN PLACE: the Docs MathBlock's in-place editor (the
 * shared MathLive controller, `createVisualMathEditor` with
 * `chrome: "field-only"`) as a React element, for a host that draws the
 * equation itself rather than through a ProseMirror NodeView -- a slide's
 * equation box (PowerPoint's Insert > Equation).
 *
 * The controller owns the draft and Office's ways out of it: Enter, Esc and a
 * press outside the equation (anything not marked
 * `VISUAL_MATH_EDITOR_FOCUS_OWNER_ATTRIBUTE`, e.g. the contextual Equation
 * tab) commit it; the caret arrowing past either edge commits it too (Office
 * hands the caret back to the text around the equation). Each way out calls
 * `onCommit` once. The host writes the document.
 *
 * Keys typed into the equation stop at this element: the window around it
 * (Delete removes the selected object, arrows nudge it) never sees them.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { registerUnsavedWorkFlush } from "../../lib/unsaved-work-hold";

import {
  createVisualMathEditor,
  type VisualMathEditorController,
  type VisualMathEditorState,
} from "../console/editor/extensions/visualMathEditor";
import type { EquationInputMode, EquationLayoutMode } from "../console/editor/extensions/equationCatalog";
import { useEquationVisualEditorLabels } from "./EquationVisualEditorDialog";

export type EquationInPlaceCommitVia = "done" | "escape" | "move-out";

export interface EquationInPlaceEditorProps {
  /** The equation the editor opens on ("" for a new one). Read once, on mount. */
  readonly latex: string;
  readonly inputMode?: EquationInputMode;
  readonly layoutMode?: EquationLayoutMode;
  readonly variant?: "block" | "inline";
  /** What the empty equation shows (Word's placeholder box by default). */
  readonly emptyPlaceholderLatex?: string;
  /** The press that opened it: the caret goes where it landed. */
  readonly pointerAnchor?: { readonly clientX: number; readonly clientY: number } | null;
  /**
   * The arrow key that walked the caret into it: Right enters at the start,
   * Left at the end (Office's caret walks into the math zone, not past it).
   */
  readonly caretEdge?: "start" | "end" | null;
  /** `direction` is the side a `"move-out"` left by (Left at the start: backward). */
  readonly onCommit: (
    state: VisualMathEditorState,
    via: EquationInPlaceCommitVia,
    direction?: "backward" | "forward",
  ) => void;
  readonly onCancel: () => void;
  /** The live controller while the draft is open, then null (the Equation tab drives it). */
  readonly onController?: (controller: VisualMathEditorController | null) => void;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly testId?: string;
}

/** Events the window around the equation must not act on. */
const CONTAINED_EVENTS = [
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "pointerdown",
  "mousedown",
  "click",
  "dblclick",
  "contextmenu",
  "copy",
  "cut",
  "paste",
] as const;

export function EquationInPlaceEditor({
  latex,
  inputMode = "latex",
  layoutMode = "professional",
  variant = "block",
  emptyPlaceholderLatex,
  pointerAnchor = null,
  caretEdge = null,
  onCommit,
  onCancel,
  onController,
  className,
  style,
  testId,
}: EquationInPlaceEditorProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const labels = useEquationVisualEditorLabels();
  // Read when the controller is built: the draft must not be rebuilt (and
  // lose what was typed) because a parent re-rendered with new callbacks.
  const latest = useRef({ latex, inputMode, layoutMode, variant, emptyPlaceholderLatex, pointerAnchor, caretEdge, labels });
  const callbacks = useRef({ onCommit, onCancel, onController });
  useEffect(() => {
    callbacks.current = { onCommit, onCancel, onController };
  }, [onCommit, onCancel, onController]);

  useEffect(() => {
    if (!host) return;
    const initial = latest.current;
    let finished = false;
    let controller: VisualMathEditorController | null = null;
    const finish = (
      state: VisualMathEditorState,
      via: EquationInPlaceCommitVia,
      direction?: "backward" | "forward",
    ) => {
      if (finished) return;
      finished = true;
      callbacks.current.onCommit(state, via, direction);
    };
    controller = createVisualMathEditor({
      initialLatex: initial.latex,
      initialInputMode: initial.inputMode,
      initialLayoutMode: initial.layoutMode,
      variant: initial.variant,
      chrome: "field-only",
      emptyPlaceholderLatex: initial.emptyPlaceholderLatex,
      labels: initial.labels,
      onCommit: (state, detail) => finish(state, detail?.via === "escape" ? "escape" : "done"),
      onCancel: () => {
        if (finished) return;
        finished = true;
        callbacks.current.onCancel();
      },
      onMoveOut: (direction) => {
        if (!controller) return false;
        finish(controller.getState(), "move-out", direction);
        return true;
      },
    });
    const stop = (event: Event) => event.stopPropagation();
    for (const type of CONTAINED_EVENTS) host.addEventListener(type, stop);
    host.replaceChildren(controller.dom);
    callbacks.current.onController?.(controller);
    // The press or command that opened the editor may refocus its own
    // surface after this runs (the slide, a ribbon button): re-assert the
    // draft's focus across the next frames, as the Docs MathBlock does.
    const live = controller;
    const focusDraft = () => {
      if (!finished) live.focus();
    };
    focusDraft();
    const anchor = initial.pointerAnchor;
    if (anchor) live.beginPointerSelection(anchor.clientX, anchor.clientY);
    else if (initial.caretEdge) live.placeCaretAtEdge(initial.caretEdge);
    let second = 0;
    const first = requestAnimationFrame(() => {
      focusDraft();
      second = requestAnimationFrame(() => {
        if (!live.dom.contains(document.activeElement)) focusDraft();
      });
    });
    // Taken down with the draft still open (its pane or window closed, the
    // slide changed, the page going): written as Done writes it, as Office
    // keeps an equation's words however the box is left. The page going or
    // the app quitting writes it first (lib/draft-commit-on-leave).
    const leave = () => {
      if (!finished) finish(live.getState(), "done");
    };
    const unregisterLeave = registerUnsavedWorkFlush(`equation-draft:${Math.random().toString(36).slice(2)}`, leave);
    window.addEventListener("beforeunload", leave, true);
    window.addEventListener("pagehide", leave, true);
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      unregisterLeave();
      window.removeEventListener("beforeunload", leave, true);
      window.removeEventListener("pagehide", leave, true);
      try {
        leave();
      } catch {
        // a host gone with it: nothing to write the draft to
      }
      finished = true;
      for (const type of CONTAINED_EVENTS) host.removeEventListener(type, stop);
      callbacks.current.onController?.(null);
      live.destroy();
      host.replaceChildren();
      controller = null;
    };
  }, [host]);

  return <div ref={setHost} className={className} style={style} data-testid={testId} />;
}
