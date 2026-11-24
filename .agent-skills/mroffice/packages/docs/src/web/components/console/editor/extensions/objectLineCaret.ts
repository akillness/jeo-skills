"use client";



























/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { documentBoundaryInteractionKey } from "@mrnote/core/web/components/console/editor/native-document/documentBoundaryInteraction.ts";
import { isInlineDrawingNode } from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import { isImeCompositionActive } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import { parkedBlockObjectSide } from "@mrnote/core/web/components/console/editor/extensions/objectPlacement.ts";
import { clipToVisibleEditor } from "@mrnote/core/web/components/console/editor/native-document/visibleEditorClip.ts";
import { officeCaretFontScale, officeScaledCaretBox } from "@mrnote/core/web/lib/office-painted-caret.ts";

/** TextStyling's font size mark (`size`: "<n>px"). Named here, not imported,
 * so this extension pulls in no text-styling module. */
const FONT_SIZE_MARK_NAME = "fontSize";

function markSizePx(marks: readonly { readonly type: { readonly name: string }; readonly attrs: Record<string, unknown> }[]): number | null {
  const mark = marks.find((candidate) => candidate.type.name === FONT_SIZE_MARK_NAME);
  if (!mark) return null;
  const match = /^(\d+(?:\.\d+)?)px$/.exec(String(mark.attrs.size ?? "").trim());
  return match ? Number.parseFloat(match[1]) : null;
}

/**
 * The size held at a bare caret: the stored marks' size where it is not the
 * size of the text the caret stands in. A number in px, "block" when the
 * stored marks drop the size (what is typed next takes the paragraph's own),
 * null when the caret types the size it stands beside.
 */
export function heldCaretFontSize(state: EditorState): number | "block" | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty || !state.storedMarks) return null;
  if (!selection.$head.parent.isTextblock) return null;
  const held = markSizePx(state.storedMarks);
  const beside = markSizePx(selection.$head.marks());
  if (held === beside) return null;
  return held ?? "block";
}

/**
 * On the paragraph whose caret the drawn one replaces. The stylesheet makes
 * that paragraph's native caret transparent while the editor has focus and
 * no composition runs (the root's `data-object-line-caret-composing`). It
 * used to be a class on the editor root, and caret-color is inherited: every
 * paint (each update and scroll with the caret in such a paragraph) took
 * the class off to read the caret colour and put it back, two restyles of
 * the whole document, each 300 ms and more in WebKit on a long document.
 */
export const OBJECT_LINE_CARET_ATTR = "data-object-line-caret";
const COMPOSING_ATTR = "data-object-line-caret-composing";

/**
 * An in-line object the caret can stand beside: a drawing, or an in-line
 * equation. The browser draws no caret beside a non-editable equation at the
 * start of its line (nothing to measure there), and one as tall as the line
 * box after it; Word draws it at the equation's edge, as tall as the equation.
 */
function isCaretObjectNode(node: { readonly type: { readonly name: string } }): boolean {
  return isInlineDrawingNode(node) || node.type.name === "inlineMath";
}

function paragraphHoldsDrawing(state: EditorState): boolean {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const parent = selection.$head.parent;
  if (!parent.isTextblock) return false;
  let holds = false;
  parent.forEach((child) => {
    if (!holds && isCaretObjectNode(child)) holds = true;
  });
  return holds;
}

/** Whether the document's state lets the drawn caret stand in for the
 * native one; focus and composition are the view's part. */
function drawnCaretState(state: EditorState): boolean {
  return (
    (paragraphHoldsDrawing(state) || heldCaretFontSize(state) !== null) &&
    // No caret at all while the boundary policy keeps it hidden (a
    // pointer dismissal, a caret parked beside a block object).
    documentBoundaryInteractionKey.getState(state) !== "idle" &&
    !parkedBlockObjectSide(state)
  );
}

function drawnCaretDecorations(state: EditorState): DecorationSet {
  if (!drawnCaretState(state)) return DecorationSet.empty;
  const { $head } = state.selection;
  const from = $head.before();
  return DecorationSet.create(state.doc, [
    Decoration.node(from, from + $head.parent.nodeSize, { [OBJECT_LINE_CARET_ATTR]: "true" }),
  ]);
}

/** The caret's client rect as the browser places it, text-high beside text. */
function caretRect(
  view: EditorView,
): { left: number; top: number; height: number } | null {
  const selection = view.dom.ownerDocument.getSelection();
  if (selection && selection.rangeCount > 0 && selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    if (view.dom.contains(range.startContainer)) {
      const rects = Array.from(range.getClientRects()).filter(
        (rect) => rect.height > 0,
      );
      const rect = rects[rects.length - 1];
      if (rect) return { left: rect.left, top: rect.top, height: rect.height };
    }
  }
  // Between two atoms (no text node to measure): the neighbour decides, the
  // character before the caret first, as Word takes its formatting from it.
  const { $head } = view.state.selection;
  const side = $head.nodeBefore ? -1 : 1;
  try {
    const coords = view.coordsAtPos($head.pos, side);
    return {
      left: side < 0 ? coords.right : coords.left,
      top: coords.top,
      height: coords.bottom - coords.top,
    };
  } catch {
    return null;
  }
}

/**
 * How much taller the caret draws for the size held at it: the held size
 * over the drawn size of the text it stands in, both as the page draws
 * them (a zoomed page scales both alike). Null with no held size.
 */
function heldCaretScale(view: EditorView): number | null {
  const held = heldCaretFontSize(view.state);
  if (held === null) return null;
  const { $head } = view.state.selection;
  // Text with a size of its own beside the caret: the two marks' sizes.
  const besideMark = markSizePx($head.marks());
  if (held !== "block" && besideMark !== null) return officeCaretFontScale(held, besideMark);
  const doc = view.dom.ownerDocument;
  const anchor = doc.getSelection()?.anchorNode ?? null;
  const at =
    anchor && view.dom.contains(anchor)
      ? anchor.nodeType === Node.ELEMENT_NODE
        ? (anchor as Element)
        : anchor.parentElement
      : null;
  if (!at) return null;
  const px = (element: Element | null) =>
    element ? Number.parseFloat(getComputedStyle(element).fontSize) : Number.NaN;
  if (held === "block") {
    // The size dropped: what is typed next wears the paragraph's own.
    let block: Node | null = null;
    try {
      block = view.nodeDOM($head.before());
    } catch {
      block = null;
    }
    return officeCaretFontScale(px(block instanceof Element ? block : null), px(at));
  }
  // Text wearing the paragraph's size: the held px against it as drawn,
  // read through a sized run of the page (its stated px against its drawn
  // px), so an engine that reports zoomed sizes is read alike.
  const sized = view.dom.querySelector<HTMLElement>("span[data-font-size]:not([data-type])");
  const stated = sized ? /^(\d+(?:\.\d+)?)px$/.exec(sized.dataset.fontSize ?? "") : null;
  const drawn = sized && stated ? px(sized) / Number.parseFloat(stated[1]) : 1;
  return officeCaretFontScale(held * (drawn > 0 && Number.isFinite(drawn) ? drawn : 1), px(at));
}

class ObjectLineCaretView {
  private readonly caret: HTMLElement;
  private frame = 0;
  private lastKey = "";

  constructor(private view: EditorView) {
    const doc = view.dom.ownerDocument;
    this.caret = doc.createElement("div");
    this.caret.className = "note-editor-object-line-caret";
    this.caret.setAttribute("aria-hidden", "true");
    this.caret.hidden = true;
    doc.body.append(this.caret);
    view.dom.addEventListener("focus", this.schedule);
    view.dom.addEventListener("blur", this.schedule);
    view.dom.addEventListener("compositionstart", this.onCompositionStart);
    view.dom.addEventListener("compositionend", this.onCompositionEnd);
    doc.addEventListener("scroll", this.schedule, true);
    doc.defaultView?.addEventListener("resize", this.schedule);
    this.schedule();
  }

  update(view: EditorView): void {
    this.view = view;
    this.schedule();
  }

  // The native caret shows during a composition (the candidate text is the
  // browser's to place); the drawn one steps aside in `paint`.
  private readonly onCompositionStart = () => {
    this.view.dom.setAttribute(COMPOSING_ATTR, "true");
    this.schedule();
  };

  private readonly onCompositionEnd = () => {
    this.view.dom.removeAttribute(COMPOSING_ATTR);
    this.schedule();
  };

  private readonly schedule = () => {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  };

  private paint(): void {
    const { view } = this;
    const active =
      view.editable &&
      view.hasFocus() &&
      !isImeCompositionActive(view) &&
      drawnCaretState(view.state);
    const beside = active ? caretRect(view) : null;
    const scale = beside ? heldCaretScale(view) : null;
    const caret = beside && scale !== null ? officeScaledCaretBox(beside, scale) : beside;
    // Beside a tall in-line picture scrolled half out of view the caret runs
    // past the scroller; the part the page does not show is not drawn.
    const rect = caret ? clipToVisibleEditor(view.dom, { ...caret, width: 0 }) : null;
    if (!rect) {
      // Nothing to draw. This runs on every scroll of the document for
      // every editor on it, and the colour read below forced a style
      // recalc each time (a page of unfocused editors paid ~40 ms a frame
      // while scrolling).
      this.caret.hidden = true;
      this.lastKey = "";
      return;
    }
    // The caret colour the theme gives the native caret: the root's, which
    // the paragraph's transparent caret leaves as it is.
    const style = getComputedStyle(view.dom);
    const color =
      style.caretColor && style.caretColor !== "auto"
        ? style.caretColor
        : style.color;
    this.caret.hidden = false;
    this.caret.style.color = color;
    this.caret.style.left = `${rect.left}px`;
    this.caret.style.top = `${rect.top}px`;
    this.caret.style.height = `${rect.height}px`;
    // A caret that moves shows at once and starts blinking again.
    const key = `${view.state.selection.head}:${Math.round(rect.left)}:${Math.round(rect.top)}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.caret.style.animation = "none";
      void this.caret.offsetWidth;
      this.caret.style.animation = "";
    }
  }

  destroy(): void {
    if (this.frame) window.cancelAnimationFrame(this.frame);
    const doc = this.view.dom.ownerDocument;
    this.view.dom.removeEventListener("focus", this.schedule);
    this.view.dom.removeEventListener("blur", this.schedule);
    this.view.dom.removeEventListener("compositionstart", this.onCompositionStart);
    this.view.dom.removeEventListener("compositionend", this.onCompositionEnd);
    doc.removeEventListener("scroll", this.schedule, true);
    doc.defaultView?.removeEventListener("resize", this.schedule);
    this.view.dom.removeAttribute(COMPOSING_ATTR);
    this.caret.remove();
  }
}

const objectLineCaretKey = new PluginKey("documentObjectLineCaret");

export const ObjectLineCaret = Extension.create({
  name: "objectLineCaret",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: objectLineCaretKey,
        props: { decorations: drawnCaretDecorations },
        view: (view) => new ObjectLineCaretView(view),
      }),
    ];
  },
});

export default ObjectLineCaret;
