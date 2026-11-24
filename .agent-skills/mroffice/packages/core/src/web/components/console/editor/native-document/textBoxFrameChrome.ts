/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's text box as an OBJECT: its border selects it, drags it and sizes it,
 * while a click inside puts the caret in its words.
 *
 * The `textBox` node's words are ordinary editable blocks (a paragraph, a
 * table, an equation), so typing, formatting, Insert > Equation and the
 * Equation tab work in a box exactly as in the body. What a box adds is the
 * frame, and Microsoft Support ("Add, copy, or remove a text box in Word")
 * gives the frame its own gestures:
 *
 * - the pointer on the border is the four-headed arrow: a press there selects
 *   the box itself and a drag moves it;
 * - the eight grips size it;
 * - with the BORDER selected, Delete removes the box; with the caret inside,
 *   Delete only removes words;
 * - Esc while typing in the box selects the box (the shared Office object
 *   rule PowerPoint's text boxes already follow: `escapeTextToObject`).
 *
 * The chrome is the selection frame every Office drawing host paints
 * (`OfficeDrawingSelection`): solid while the box is selected, dashed while
 * the caret is in its words. It lives in the frame node's own element,
 * outside the editable content, and is laid over the frame the layout pass
 * placed (`floatingTextBoxLayout` records where offset 0 of each axis lands,
 * so a drag writes Word's own `wp:posOffset` on the frame's own origins).
 *
 * A move or a resize previews on the painted frame and commits ONE
 * transaction on release -- one undo step, one collaborative change.
 */

import { Extension } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { officeDrawingSelectionStyles } from "../../../office-ribbon/OfficeDrawingSelection";
import { normalizeFloatAnchor, EMU_PER_PX } from "../../../../lib/office-float-anchor";
import {
  DOCUMENT_TEXT_BOX_MAX_EDGE_EMU,
  DOCUMENT_TEXT_BOX_MIN_EDGE_EMU,
  documentTextBoxFrameIsEditable,
  documentTextBoxMovedAnchor,
  documentTextBoxResizedAnchor,
  type DocumentTextBoxPaintedFrame,
} from "../../../../lib/document-text-box-frame";
import { RESIZE_HANDLES, constrainedMoveAxis, type ResizeHandle } from "../../../../lib/presentation-drag";
import { TEXT_BOX_NODE_NAME } from "./contentControls";
import { resizeDocumentObject } from "./documentObjectResize";
import { beginDocumentObjectSnap } from "./documentObjectSnap";
import { tryCapturePointer } from "./pointerCapture";
import { reanchorMovedDocumentFloats } from "./floatReanchor";
import { liftSheetsDuringDrag } from "./dragSheetLift";

const EDGES = ["top", "right", "bottom", "left"] as const;

const RESIZE_LABELS: Record<ResizeHandle, string> = {
  n: "Resize text box top",
  s: "Resize text box bottom",
  e: "Resize text box right",
  w: "Resize text box left",
  nw: "Resize text box top left",
  ne: "Resize text box top right",
  se: "Resize text box bottom right",
  sw: "Resize text box bottom left",
};

/** What the layout pass measured for one anchored frame, in page CSS px. */
export interface TextBoxFramePaint extends DocumentTextBoxPaintedFrame {
  readonly widthPx: number;
  readonly heightPx: number;
  /** Page px per client px is 1 / scale. */
  readonly scaleX: number;
  readonly scaleY: number;
}

const paints = new WeakMap<HTMLElement, TextBoxFramePaint>();

/** The layout pass's reading of `wrapper`, kept for the next drag. */
export function recordTextBoxFramePaint(wrapper: HTMLElement, paint: TextBoxFramePaint): void {
  paints.set(wrapper, paint);
}

interface FrameHost {
  /** Read lazily: a node view is built while the editor view is being made. */
  readonly getView: () => EditorView;
  readonly getPos: () => number | undefined;
  readonly wrapper: HTMLElement;
  readonly frame: HTMLElement;
}

/**
 * The selection frame, grips and border strips of one text box. Hidden until
 * the box is selected or holds the caret (`data-text-box-active`, set by
 * {@link TextBoxFrameChrome}'s plugin); the border strips stay live so the
 * border can be pressed on a box that is not selected yet.
 */
export class TextBoxFrameChromeView {
  readonly element: HTMLElement;
  private readonly host: FrameHost;
  private gesture: (() => void) | null = null;

  constructor(host: FrameHost) {
    this.host = host;
    const chrome = document.createElement("div");
    chrome.className = `mrnote-text-box__chrome ${officeDrawingSelectionStyles.frame}`;
    chrome.contentEditable = "false";
    chrome.setAttribute("aria-hidden", "true");
    chrome.dataset.documentSelectionChrome = "true";
    chrome.dataset.testid = "document-text-box-chrome";
    for (const edge of EDGES) {
      const strip = document.createElement("div");
      strip.className = "mrnote-text-box__edge";
      strip.dataset.edge = edge;
      strip.dataset.testid = `document-text-box-edge-${edge}`;
      strip.addEventListener("pointerdown", (event) => this.pressBorder(event));
      chrome.append(strip);
    }
    for (const handle of RESIZE_HANDLES) {
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.className = `${officeDrawingSelectionStyles.resize} mrnote-text-box__grip`;
      button.dataset.officeDrawingHandle = handle;
      button.dataset.testid = `document-text-box-resize-${handle}`;
      button.setAttribute("aria-label", RESIZE_LABELS[handle]);
      button.style.setProperty("--office-drawing-grip-size", "16px");
      button.style.setProperty("--office-drawing-grip-edge", "-8px");
      button.addEventListener("pointerdown", (event) => this.pressGrip(event, handle));
      chrome.append(button);
    }
    this.element = chrome;
  }

  /** Lay the chrome over the frame where the layout pass put it. */
  sync(): void {
    const { frame } = this.host;
    const target = this.nodeAt();
    const movable = !!target && documentTextBoxFrameIsEditable(target.node.attrs);
    this.element.dataset.movable = movable ? "true" : "false";
    if (this.gesture) return;
    this.element.style.left = `${frame.offsetLeft}px`;
    this.element.style.top = `${frame.offsetTop}px`;
    this.element.style.width = `${frame.offsetWidth}px`;
    this.element.style.height = `${frame.offsetHeight}px`;
    this.element.style.transform = frame.style.transform;
  }

  destroy(): void {
    this.gesture?.();
    this.gesture = null;
  }

  private nodeAt(): { pos: number; node: ProseMirrorNode } | null {
    const pos = this.host.getPos();
    if (typeof pos !== "number") return null;
    const node = this.host.getView().state.doc.nodeAt(pos);
    return node && node.type.name === TEXT_BOX_NODE_NAME ? { pos, node } : null;
  }

  private selectFrame(): void {
    const target = this.nodeAt();
    if (!target) return;
    const view = this.host.getView();
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, target.pos)));
    view.focus();
  }

  private pressBorder(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectFrame();
    if (!this.host.getView().editable || this.element.dataset.movable !== "true") return;
    const paint = paints.get(this.host.wrapper);
    if (!paint) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let dx = 0;
    let dy = 0;
    // Word's alignment guides (documentObjectSnap).
    const snap = beginDocumentObjectSnap([this.host.wrapper]);
    // Drawn over the next page while carried across a seam.
    const lift = liftSheetsDuringDrag([this.host.wrapper]);
    this.track(
      event,
      (next) => {
        lift.follow(next.clientY - startY);
        const along = constrainedMoveAxis(next.clientX - startX, next.clientY - startY, next.shiftKey);
        dx = along === "vertical" ? 0 : (next.clientX - startX) / (paint.scaleX || 1);
        dy = along === "horizontal" ? 0 : (next.clientY - startY) / (paint.scaleY || 1);
        if (snap) ({ dx, dy } = snap.move(dx, dy, next, along));
        const shift = `${dx}px ${dy}px`;
        this.host.frame.style.translate = shift;
        this.element.style.translate = shift;
      },
      (commit) => {
        snap?.end();
        lift.lower();
        this.host.frame.style.translate = "";
        this.element.style.translate = "";
        if (!commit || (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)) return;
        this.commitAnchor((anchor) => documentTextBoxMovedAnchor(anchor, paint, dx, dy), {
          dxClient: dx * (paint.scaleX || 1),
          dyClient: dy * (paint.scaleY || 1),
        });
      },
    );
  }

  private pressGrip(event: PointerEvent, handle: ResizeHandle): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.host.getView().editable || this.element.dataset.movable !== "true") return;
    const paint = paints.get(this.host.wrapper);
    if (!paint) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const base = { left: paint.leftPx, top: paint.topPx, width: paint.widthPx, height: paint.heightPx };
    let preview = base;
    const { frame } = this.host;
    const startWidth = frame.style.width;
    const startHeight = frame.style.height;
    // Word's alignment guides size the dragged edges onto the page's other
    // objects and margins (points only); never a turned box.
    const snap = /rotate/.test(frame.style.transform) ? null : beginDocumentObjectSnap([this.host.wrapper]);
    this.track(
      event,
      (next) => {
        const resized = (dx: number, dy: number) =>
          resizeDocumentObject(base, handle, dx, dy, {
            scaleX: paint.scaleX || 1,
            scaleY: paint.scaleY || 1,
            emuPerPx: 1,
            min: DOCUMENT_TEXT_BOX_MIN_EDGE_EMU / EMU_PER_PX,
            max: DOCUMENT_TEXT_BOX_MAX_EDGE_EMU / EMU_PER_PX,
            lockAspect: next.shiftKey,
            fromCenter: next.ctrlKey || next.altKey,
          });
        let pointerDx = next.clientX - startX;
        let pointerDy = next.clientY - startY;
        if (snap) {
          ({ dx: pointerDx, dy: pointerDy } = snap.resize(resized, pointerDx, pointerDy, handle, next, {
            lockAspect: next.shiftKey,
            centered: next.ctrlKey || next.altKey,
          }));
        }
        preview = resized(pointerDx, pointerDy);
        const shift = `${preview.left - base.left}px ${preview.top - base.top}px`;
        frame.style.width = `${preview.width}px`;
        frame.style.height = `${preview.height}px`;
        frame.style.translate = shift;
        this.element.style.width = `${preview.width}px`;
        this.element.style.height = `${preview.height}px`;
        this.element.style.translate = shift;
      },
      (commit) => {
        snap?.end();
        frame.style.translate = "";
        this.element.style.translate = "";
        const changed =
          commit &&
          (preview.left !== base.left ||
            preview.top !== base.top ||
            preview.width !== base.width ||
            preview.height !== base.height);
        if (!changed) {
          frame.style.width = startWidth;
          frame.style.height = startHeight;
          this.sync();
          return;
        }
        this.commitAnchor((anchor) =>
          documentTextBoxResizedAnchor(anchor, paint, {
            leftPx: preview.left,
            topPx: preview.top,
            widthPx: preview.width,
            heightPx: preview.height,
          }),
        );
      },
    );
  }

  /** Follow one pointer until release (commit) or Esc / cancel (no commit). */
  private track(
    event: PointerEvent,
    move: (next: PointerEvent) => void,
    end: (commit: boolean) => void,
  ): void {
    this.gesture?.();
    const target = event.currentTarget instanceof Element ? event.currentTarget : null;
    tryCapturePointer(target, event.pointerId);
    const ownerWindow = this.element.ownerDocument.defaultView ?? window;
    const onMove = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      move(next);
    };
    const finish = (commit: boolean) => {
      ownerWindow.removeEventListener("pointermove", onMove, true);
      ownerWindow.removeEventListener("pointerup", onUp, true);
      ownerWindow.removeEventListener("pointercancel", onCancel, true);
      ownerWindow.removeEventListener("keydown", onKey, true);
      this.gesture = null;
      end(commit);
    };
    const onUp = (next: PointerEvent) => {
      if (next.pointerId === event.pointerId) finish(true);
    };
    const onCancel = (next: PointerEvent) => {
      if (next.pointerId === event.pointerId) finish(false);
    };
    const onKey = (next: KeyboardEvent) => {
      if (next.key !== "Escape") return;
      next.preventDefault();
      next.stopPropagation();
      finish(false);
    };
    ownerWindow.addEventListener("pointermove", onMove, true);
    ownerWindow.addEventListener("pointerup", onUp, true);
    ownerWindow.addEventListener("pointercancel", onCancel, true);
    ownerWindow.addEventListener("keydown", onKey, true);
    this.gesture = () => finish(false);
  }

  private commitAnchor(
    next: (anchor: NonNullable<ReturnType<typeof normalizeFloatAnchor>>) => unknown,
    move?: { readonly dxClient: number; readonly dyClient: number },
  ): void {
    const target = this.nodeAt();
    if (!target) return;
    const anchor = normalizeFloatAnchor(target.node.attrs.floatAnchor);
    if (!anchor) return;
    const view = this.host.getView();
    const tr = view.state.tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, floatAnchor: next(anchor) });
    // Moved over another paragraph or page, the box is anchored there, as
    // Word's anchor follows a moved object (floatReanchor).
    const placed = move
      ? reanchorMovedDocumentFloats(view, tr, [{ pos: target.pos, ...move, sizeKept: true }])
      : null;
    const at = placed?.get(target.pos)?.[0] ?? target.pos;
    tr.setSelection(NodeSelection.create(tr.doc, tr.doc.nodeAt(at) ? at : target.pos));
    view.dispatch(closeHistory(tr));
    view.focus();
  }
}

/** A box with a frame of its own: anchored, or In Line with Text at its own size. */
function isFramed(node: ProseMirrorNode): boolean {
  return Boolean(node.attrs.floatAnchor || node.attrs.frameExtent);
}

/** The framed text box the selection is ON (selected) or IN (caret inside). */
export function activeTextBoxFrame(
  state: EditorState,
): { pos: number; node: ProseMirrorNode; mode: "selected" | "editing" } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === TEXT_BOX_NODE_NAME) {
    return isFramed(selection.node) ? { pos: selection.from, node: selection.node, mode: "selected" } : null;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== TEXT_BOX_NODE_NAME) continue;
    return isFramed(node) ? { pos: $from.before(depth), node, mode: "editing" } : null;
  }
  return null;
}

/** The caret at the end of the box's last textblock, or null. */
function endOfFrameText(doc: ProseMirrorNode, framePos: number, frame: ProseMirrorNode): number | null {
  let end: number | null = null;
  frame.descendants((node, offset) => {
    if (node.isTextblock) end = framePos + 1 + offset + 1 + node.content.size;
    return true;
  });
  return end === null || end > doc.content.size ? null : end;
}

const textBoxFrameChromeKey = new PluginKey("textBoxFrameChrome");

/**
 * Marks the active box for its chrome, and gives a selected box Word's keys:
 * typing goes into the box's words and Esc in the words selects the box.
 */
export const TextBoxFrameChrome = Extension.create({
  name: "textBoxFrameChrome",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: textBoxFrameChromeKey,
        props: {
          decorations(state) {
            const active = activeTextBoxFrame(state);
            if (!active) return null;
            return DecorationSet.create(state.doc, [
              Decoration.node(active.pos, active.pos + active.node.nodeSize, {
                "data-text-box-active": active.mode,
              }),
            ]);
          },
          handleKeyDown(view, event) {
            if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return false;
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
            const active = activeTextBoxFrame(view.state);
            if (!active || active.mode !== "editing") return false;
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, active.pos)));
            return true;
          },
          handleTextInput(view, _from, _to, text) {
            const active = activeTextBoxFrame(view.state);
            if (!active || active.mode !== "selected" || !view.editable) return false;
            // A selected box takes what is typed into its words rather than
            // being replaced by it (Word adds the text to the shape).
            const end = endOfFrameText(view.state.doc, active.pos, active.node);
            if (end === null) return false;
            const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, end)).insertText(text);
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
