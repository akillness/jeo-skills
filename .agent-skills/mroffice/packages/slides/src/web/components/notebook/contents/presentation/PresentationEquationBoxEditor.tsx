"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A slide's equation box open IN PLACE (PowerPoint's Insert > Equation box):
 * the shared in-place equation field (`EquationInPlaceEditor`, the Docs
 * MathBlock's MathLive editor) drawn on the slide's design surface where the
 * box stands, at the size and colour the slide draws the equation in.
 *
 * A box already on the slide is drawn from its top-left and grows to the
 * right and down with the equation, as a no-wrap box that resizes to fit its
 * text does; the committed box is sized to the equation the same way
 * (`equationBoxFrame`, anchored at its top-left). A new box is drawn centred
 * on the frame it will be centred on when it commits (`placeBox`, anchor
 * "center"), so committing does not move the equation. While it is open the
 * slide's own drawing of the box's equation is hidden, so the draft is the
 * only equation there. An empty draft shows PowerPoint's prompt ("Type
 * equation here.").
 */

import { officeShownTextLook } from "@mrnote/core/web/lib/office-painted-caret.ts";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  EquationInPlaceEditor,
  type EquationInPlaceCommitVia,
} from "@mrnote/core/web/components/office-equation/EquationInPlaceEditor.tsx";
import type {
  VisualMathEditorController,
  VisualMathEditorState,
} from "@mrnote/core/web/components/console/editor/extensions/visualMathEditor.ts";
import type { EquationInputMode } from "@mrnote/core/web/components/console/editor/extensions/equationCatalog.ts";
import { EQUATION_BOX_TEXT_INSETS } from "../../../../lib/presentation-equation-box";
import { PRESENTATION_MATH_SELECTOR } from "@mrnote/core/web/lib/presentation/math-atom.ts";
import type { PresentationInlineEquationAnchor } from "./presentationEquationInlineAnchor";
import { PRESENTATION_EQUATION_SLOT_ATTRIBUTE } from "@mrnote/core/web/components/notebook/contents/presentation/presentationEquationSlot.ts";

/** EMU per CSS px on the slide's design surface. */
const EMU_PER_PX = 9_525;

/** `text` as the argument of `\text{...}` (the prompt is words, never markup). */
export function equationPromptLatex(text: string): string {
  const words = text.replace(/[\\{}#$%&_^~]/g, "").trim();
  return words ? `\\text{${words}}` : "";
}

/** The selector of the slide's own drawing of block `blockId`'s equation. */
function hiddenEquationSelector(blockId: string): string {
  const escaped = blockId.replace(/["\\]/g, "\\$&");
  return `[data-block-id="${escaped}"] ${PRESENTATION_MATH_SELECTOR}`;
}

/**
 * The size (CSS px on the design surface) and colour the slide draws box
 * `blockId`'s equation in now -- what Home last gave it, even while the
 * equation is open (its own drawing is hidden, not removed). Null when the
 * slide draws no such equation.
 */
export function presentationEquationLiveLook(
  canvas: ParentNode | null | undefined,
  blockId: string,
): { fontSizePx: number; color: string | null; look?: ReturnType<typeof officeShownTextLook> } | null {
  const atom = canvas?.querySelector<HTMLElement>(hiddenEquationSelector(blockId));
  if (!atom || typeof window === "undefined") return null;
  const computed = window.getComputedStyle(atom);
  const fontSizePx = Number.parseFloat(computed.fontSize);
  if (!Number.isFinite(fontSizePx) || fontSizePx <= 0) return null;
  // The open equation looks as the drawn one does (WordArt's outline and
  // shadows), in a colour it can be seen in: a gradient-filled WordArt
  // states a transparent one.
  const look = officeShownTextLook(atom);
  return { fontSizePx, color: look.color, look };
}

export function PresentationEquationBoxEditor({
  frame,
  fontSizePx,
  color,
  latex,
  inputMode,
  hiddenBlockId,
  placeholder,
  pointer,
  onCommit,
  onCancel,
  onController,
}: {
  /** The box's slide geometry in EMU (a new box: where it will stand). */
  readonly frame: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly fontSizePx: number;
  readonly color: string | null;
  readonly latex: string;
  readonly inputMode: EquationInputMode;
  /** The box on the slide whose equation this draft is (null: a new box). */
  readonly hiddenBlockId: string | null;
  /** PowerPoint's prompt, in the person's language. */
  readonly placeholder: string;
  readonly pointer: { readonly clientX: number; readonly clientY: number } | null;
  readonly onCommit: (
    state: VisualMathEditorState,
    via: EquationInPlaceCommitVia,
    direction?: "backward" | "forward",
  ) => void;
  readonly onCancel: () => void;
  readonly onController: (controller: VisualMathEditorController | null) => void;
}) {
  // Home's size and colour reach the box's equation while it is open: the
  // draft follows what the slide now draws the (hidden) equation in.
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [liveLook, setLiveLook] = useState<ReturnType<typeof presentationEquationLiveLook>>(null);
  useEffect(() => {
    const canvas = hostRef.current?.parentElement ?? null;
    if (!hiddenBlockId || !canvas || typeof MutationObserver === "undefined") return;
    const read = () => {
      const look = presentationEquationLiveLook(canvas, hiddenBlockId);
      if (!look) return;
      setLiveLook((previous) =>
        previous && JSON.stringify(previous) === JSON.stringify(look) ? previous : look,
      );
    };
    const escaped = hiddenBlockId.replace(/["\\]/g, "\\$&");
    const block = canvas.querySelector(`[data-block-id="${escaped}"]`);
    const observer = new MutationObserver(read);
    observer.observe(block ?? canvas, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
    read();
    return () => observer.disconnect();
  }, [hiddenBlockId]);
  const drawnSizePx = liveLook?.fontSizePx ?? fontSizePx;
  const drawnColor = liveLook?.color ?? color;
  const centred = hiddenBlockId === null;
  const style: CSSProperties = {
    position: "absolute",
    // An existing box is anchored at its top-left, like the equation it
    // stands in for: a no-wrap box grows to the right and down as its text
    // grows, so the equation never shifts while it is written or when the box
    // is resized. A new one grows about the centre it commits around.
    left: (centred ? frame.left + frame.width / 2 : frame.left) / EMU_PER_PX,
    top: (centred ? frame.top + frame.height / 2 : frame.top) / EMU_PER_PX,
    transform: centred ? "translate(-50%, -50%)" : undefined,
    // An existing box is covered whole while it is edited.
    minWidth: hiddenBlockId ? frame.width / EMU_PER_PX : undefined,
    minHeight: hiddenBlockId ? frame.height / EMU_PER_PX : undefined,
    boxSizing: "border-box",
    padding: `${EQUATION_BOX_TEXT_INSETS.top / EMU_PER_PX}px ${EQUATION_BOX_TEXT_INSETS.right / EMU_PER_PX}px`,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    whiteSpace: "nowrap",
    fontSize: drawnSizePx,
    lineHeight: "normal",
    ...(liveLook?.look ?? {}),
    color: drawnColor ?? undefined,
    // The text box's editing frame, at the same on-screen weight at every zoom.
    outline: "calc(1px * var(--office-drawing-grip-scale, 1)) dashed rgba(96, 96, 96, 0.75)",
    zIndex: 100_000,
  };
  return (
    <>
      {hiddenBlockId ? <style>{`${hiddenEquationSelector(hiddenBlockId)}{visibility:hidden}`}</style> : null}
      <div
        ref={hostRef}
        style={style}
        data-presentation-equation-box-editor={hiddenBlockId ?? "new"}
        data-testid="presentation-equation-box-editor"
      >
        <EquationInPlaceEditor
          latex={latex}
          inputMode={inputMode}
          layoutMode="professional"
          variant="block"
          emptyPlaceholderLatex={equationPromptLatex(placeholder)}
          pointerAnchor={pointer}
          onCommit={onCommit}
          onCancel={onCancel}
          onController={onController}
          testId="presentation-equation-box-field"
        />
      </div>
    </>
  );
}

/**
 * An equation in a line of a slide's words open IN PLACE (PowerPoint's
 * Insert > Equation with the caret in a text box, or a click on an equation
 * among words): the same in-place field, in its in-line form, drawn over the
 * line at the caret (or over the equation it edits) at the line's size and
 * colour, under PowerPoint's prompt while empty. The words cannot make room
 * for it while it is open (they are drawn by the box's own editor), so it
 * covers what follows on its backdrop; the equation joins the words, and
 * they reflow around it, when it commits.
 */
export function PresentationInlineEquationEditor({
  anchor,
  latex,
  inputMode,
  placeholder,
  pointer,
  edge = null,
  onCommit,
  onCancel,
  onController,
  chrome = false,
}: {
  /**
   * Marked as the editor's chrome (`data-office-chrome`): a host keeping the
   * words open while their equation is written (a sheet shape's text field)
   * does not take a press in the equation for a press outside the words.
   */
  readonly chrome?: boolean;
  readonly anchor: PresentationInlineEquationAnchor;
  readonly latex: string;
  readonly inputMode: EquationInputMode;
  readonly placeholder: string;
  readonly pointer: { readonly clientX: number; readonly clientY: number } | null;
  /** The side an arrow key walked the caret in from. */
  readonly edge?: "start" | "end" | null;
  readonly onCommit: (
    state: VisualMathEditorState,
    via: EquationInPlaceCommitVia,
    direction?: "backward" | "forward",
  ) => void;
  readonly onCancel: () => void;
  readonly onController: (controller: VisualMathEditorController | null) => void;
}) {
  const style: CSSProperties = {
    position: "absolute",
    left: anchor.left,
    top: anchor.top,
    minWidth: anchor.minWidth || undefined,
    minHeight: anchor.height,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    whiteSpace: "nowrap",
    fontSize: anchor.fontSizePx,
    lineHeight: "normal",
    color: anchor.color ?? undefined,
    background: anchor.backdrop,
    zIndex: 100_000,
  };
  return (
    <div
      style={style}
      data-presentation-equation-inline-editor=""
      data-testid="presentation-equation-inline-editor"
      {...(chrome ? { "data-office-chrome": "" } : {})}
    >
      <EquationInPlaceEditor
        latex={latex}
        inputMode={inputMode}
        layoutMode="professional"
        variant="inline"
        emptyPlaceholderLatex={equationPromptLatex(placeholder)}
        pointerAnchor={pointer}
        caretEdge={edge}
        onCommit={onCommit}
        onCancel={onCancel}
        onController={onController}
        testId="presentation-equation-inline-field"
      />
    </div>
  );
}

/**
 * An equation in a line of a slide's words open IN PLACE, in the line: the
 * shared in-place field (its in-line form) pinned over the slot the words
 * lay out for it (`presentationEquationSlot`), at the line's size and colour.
 * It reports its own size so the slot grows with it -- a centred line
 * re-centres, a long one wraps, as PowerPoint lays out the equation being
 * typed -- and it follows the slot wherever the words put it. An empty field
 * shows PowerPoint's prompt ("Type equation here.").
 */
export function PresentationEquationSlotEditor({
  sentinel,
  latex,
  inputMode,
  placeholder,
  pointer,
  edge = null,
  onSize,
  onCommit,
  onCancel,
  onController,
  chrome = false,
}: {
  /** Marked as the editor's chrome (`data-office-chrome`), as the in-line editor can be. */
  readonly chrome?: boolean;
  readonly sentinel: string;
  readonly latex: string;
  readonly inputMode: EquationInputMode;
  readonly placeholder: string;
  readonly pointer: { readonly clientX: number; readonly clientY: number } | null;
  /** The side an arrow key walked the caret in from. */
  readonly edge?: "start" | "end" | null;
  readonly onSize: (width: number, height: number) => void;
  readonly onCommit: (
    state: VisualMathEditorState,
    via: EquationInPlaceCommitVia,
    direction?: "backward" | "forward",
  ) => void;
  readonly onCancel: () => void;
  readonly onController: (controller: VisualMathEditorController | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{
    left: number;
    top: number;
    fontSize: number;
    lineHeight: string;
    look: ReturnType<typeof officeShownTextLook>;
  } | null>(null);
  const onSizeRef = useRef(onSize);
  useEffect(() => {
    onSizeRef.current = onSize;
  }, [onSize]);
  // Follow the slot: the words move it as the field grows (and on zoom).
  useEffect(() => {
    let frame = 0;
    let last = "";
    const follow = () => {
      const host = hostRef.current;
      const canvas = host?.parentElement;
      const slot = canvas
        ? Array.from(canvas.querySelectorAll<HTMLElement>(`[${PRESENTATION_EQUATION_SLOT_ATTRIBUTE}]`)).find(
            (element) => element.getAttribute(PRESENTATION_EQUATION_SLOT_ATTRIBUTE) === sentinel,
          )
        : undefined;
      if (canvas && slot) {
        const canvasRect = canvas.getBoundingClientRect();
        const scale = canvas.offsetWidth > 0 ? canvasRect.width / canvas.offsetWidth : 1;
        const rect = slot.getBoundingClientRect();
        const computed = window.getComputedStyle(slot);
        // The words' own scale under the canvas's (a box that shrinks its text).
        const own = slot.offsetHeight > 0 ? rect.height / slot.offsetHeight / scale : 1;
        const next = {
          left: Math.round(((rect.left - canvasRect.left) / scale - canvas.clientLeft) * 100) / 100,
          top: Math.round(((rect.top - canvasRect.top) / scale - canvas.clientTop) * 100) / 100,
          fontSize: (Number.parseFloat(computed.fontSize) || 24) * (Number.isFinite(own) && own > 0 ? own : 1),
          // The words' look (WordArt's outline and shadows) in a colour
          // that shows: the equation looks the same open and closed.
          look: officeShownTextLook(slot),
          // The line the drawn equation sits in: the open one is laid out
          // in the same line, so the slot it is measured into does not grow.
          lineHeight: computed.lineHeight,
        };
        const key = JSON.stringify(next);
        if (key !== last) {
          last = key;
          setPlace(next);
        }
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [sentinel]);
  // The slot takes the field's size.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    let width = 0;
    let height = 0;
    const observer = new ResizeObserver(() => {
      const nextWidth = Math.ceil(host.offsetWidth);
      const nextHeight = Math.ceil(host.offsetHeight);
      if (Math.abs(nextWidth - width) < 1 && Math.abs(nextHeight - height) < 1) return;
      width = nextWidth;
      height = nextHeight;
      onSizeRef.current(width, height);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const style: CSSProperties = {
    position: "absolute",
    left: place?.left ?? 0,
    top: place?.top ?? 0,
    // Hidden until the slot is found, so it never flashes in a corner.
    visibility: place ? "visible" : "hidden",
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    fontSize: place?.fontSize,
    lineHeight: place?.lineHeight ?? "normal",
    ...(place?.look ?? {}),
    zIndex: 100_000,
  };
  return (
    <div
      ref={hostRef}
      style={style}
      data-presentation-equation-inline-editor=""
      data-testid="presentation-equation-inline-editor"
      {...(chrome ? { "data-office-chrome": "" } : {})}
    >
      <EquationInPlaceEditor
        latex={latex}
        inputMode={inputMode}
        layoutMode="professional"
        variant="inline"
        emptyPlaceholderLatex={equationPromptLatex(placeholder)}
        pointerAnchor={pointer}
        caretEdge={edge}
        onCommit={onCommit}
        onCancel={onCancel}
        onController={onController}
        testId="presentation-equation-inline-field"
      />
    </div>
  );
}
