"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { isCompatMouseFromTouch } from "@mrnote/core/web/lib/pointer-capability.ts";
import { Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import {
  pointerOnLine,
  textPositionBesideLines,
} from "../extensions/dragSelectionTargets";
import {
  MOVE_THRESHOLD_PX,
  autoScrollTowardPointer,
  pointerNearScrollEdge,
  scrollParentOf,
} from "../extensions/objectMove";
import { isImeCompositionActive } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";

const documentGapDragSelectionKey = new PluginKey("documentGapDragSelection");
const SHEET_SELECTOR = "article[data-page-sheet]";

/**
 * A drag that starts in the paper between two blocks selects text, as in Word.
 *
 * Over the gap above a table or a picture (and just under a table) the
 * browser's own hit test lands on the table wrapper or the picture frame, not
 * in any editable text (or in a drawn end-of-cell mark). Chrome then has no
 * text anchor for the drag: every move
 * collapses the selection at the pointer, so the caret follows the mouse and
 * nothing is selected. Between two paragraphs the same gap resolves into the
 * neighbouring line, but a drag from just under a table still starts no
 * selection. So a press on the paper between blocks, in the text column, is
 * taken over here (in the margins only one whose caret point is not in
 * editable text, keeping native line picking there): the anchor is the nearest line on
 * the side the drag leaves from, the head follows the pointer, and the view
 * scrolls near its edges as a native drag does. A drag that leaves sideways
 * (along the gap) is anchored on the nearer line at the pointer's x, and a
 * head still off the lines goes onto the nearer line the same way, so it
 * selects along that line as Word does (the spacing is the paragraph's). A
 * press that does not move places the caret on the nearer line at the
 * pointer's x. Presses inside a block (dragSelectionTargets / the range drag
 * of equationSelection), modified or multiple clicks and IME composition keep
 * their own paths.
 */
function caretPointIsText(x: number, y: number): boolean | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
  };
  let node: Node | null = null;
  if (typeof doc.caretRangeFromPoint === "function") {
    node = doc.caretRangeFromPoint(x, y)?.startContainer ?? null;
  } else if (typeof doc.caretPositionFromPoint === "function") {
    node = doc.caretPositionFromPoint(x, y)?.offsetNode ?? null;
  } else {
    return null;
  }
  if (!node) return null;
  // Text of a mark the editor draws (a cell's or a row's end mark) is not
  // editable: the browser cannot anchor a drag selection in it either.
  return node.nodeType === Node.TEXT_NODE && Boolean(node.parentElement?.isContentEditable);
}

/** Whether x lies between the sheet's left and right page margins. */
function insideTextColumn(sheet: Element, x: number): boolean {
  if (!(sheet instanceof HTMLElement) || !sheet.offsetWidth) return false;
  const rect = sheet.getBoundingClientRect();
  const style = getComputedStyle(sheet);
  // The sheet may be drawn scaled (zoom); its padding is in layout pixels.
  const scale = rect.width / sheet.offsetWidth;
  const left = rect.left + (parseFloat(style.paddingLeft) || 0) * scale;
  const right = rect.right - (parseFloat(style.paddingRight) || 0) * scale;
  return x >= left && x <= right;
}

function textNear($pos: ResolvedPos, bias: -1 | 1): ResolvedPos | null {
  const found = Selection.findFrom($pos, bias, true) ?? Selection.findFrom($pos, -bias as -1 | 1, true);
  return found ? found.$head : null;
}

/** The nearer of the lines above and below the pressed gap, at the pointer's x. */
function nearestTextTo(
  view: EditorView,
  $pos: ResolvedPos,
  x: number,
  y: number,
): ResolvedPos | null {
  const onLine = textPositionBesideLines(view, $pos.pos, x, y);
  if (onLine !== null) return view.state.doc.resolve(onLine);
  const above = Selection.findFrom($pos, -1, true)?.$head ?? null;
  const below = Selection.findFrom($pos, 1, true)?.$head ?? null;
  if (!above || !below) return above ?? below;
  const distance = ($at: ResolvedPos) => {
    const box = view.coordsAtPos($at.pos);
    return y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
  };
  return distance(below) < distance(above) ? below : above;
}

class GapDrag {
  private scroller: HTMLElement | null;
  private dragging = false;
  private anchor: ResolvedPos | null = null;
  private x: number;
  private y: number;
  private frame = 0;

  constructor(
    private readonly view: EditorView,
    private readonly startX: number,
    private readonly startY: number,
    private readonly startPos: number,
  ) {
    this.x = startX;
    this.y = startY;
    this.scroller = scrollParentOf(view.dom);
    window.addEventListener("pointermove", this.onMove, true);
    window.addEventListener("pointerup", this.onUp, true);
    window.addEventListener("pointercancel", this.onCancel, true);
    window.addEventListener("blur", this.onCancel);
    document.addEventListener("selectstart", this.onSelectStart, true);
  }

  private startPosition(): ResolvedPos | null {
    const { doc } = this.view.state;
    if (this.startPos < 0 || this.startPos > doc.content.size) return null;
    return doc.resolve(this.startPos);
  }

  private readonly onSelectStart = (event: Event) => {
    event.preventDefault();
  };

  private readonly onMove = (event: PointerEvent) => {
    this.x = event.clientX;
    this.y = event.clientY;
    if (!this.dragging) {
      if (Math.hypot(this.x - this.startX, this.y - this.startY) < MOVE_THRESHOLD_PX) return;
      const $start = this.startPosition();
      if (!$start) {
        this.finish();
        return;
      }
      // The line the drag leaves from: above for a drag upward, below for one
      // downward, as Word anchors at the paragraph mark on that side. A drag
      // that leaves sideways stays along the gap: it selects on the nearer
      // line, from the pointer's x.
      const sideways =
        Math.abs(this.x - this.startX) > Math.abs(this.y - this.startY);
      this.anchor =
        (sideways
          ? nearestTextTo(this.view, $start, this.startX, this.startY)
          : null) ?? textNear($start, this.y < this.startY ? -1 : 1);
      if (!this.anchor) {
        this.finish();
        return;
      }
      this.dragging = true;
    }
    event.preventDefault();
    this.extend();
    this.schedule();
  };

  private readonly onUp = (event: PointerEvent) => {
    if (!this.dragging) {
      const $start = this.startPosition();
      const $caret = $start
        ? nearestTextTo(this.view, $start, event.clientX, event.clientY)
        : null;
      if ($caret) {
        this.view.dispatch(
          this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, $caret.pos))
            .setMeta("pointer", true),
        );
      }
    }
    this.finish();
  };

  private readonly onCancel = () => {
    this.finish();
  };

  private extend(): void {
    const anchor = this.anchor;
    if (!anchor) return;
    const hit = this.view.posAtCoords({ left: this.x, top: this.y });
    if (!hit) return;
    const { state } = this.view;
    // The anchor was resolved before any scroll; positions stay valid while
    // the document is unchanged, which a drag does not do.
    if (anchor.doc !== state.doc) {
      this.finish();
      return;
    }
    // A head off the lines (still in the gap, under a paragraph's last line)
    // goes onto the nearer line at the pointer's x.
    const $hit = state.doc.resolve(hit.pos);
    const head = $hit.parent.inlineContent
      ? pointerOnLine(this.view, hit.pos, this.x, this.y).pos
      : (textPositionBesideLines(this.view, hit.pos, this.x, this.y) ?? hit.pos);
    const selection = TextSelection.between(anchor, state.doc.resolve(head));
    if (state.selection.eq(selection)) return;
    this.view.dispatch(state.tr.setSelection(selection).setMeta("pointer", true));
  }

  private schedule(): void {
    if (this.frame || !pointerNearScrollEdge(this.scroller, this.y)) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.dragging) return;
      autoScrollTowardPointer(this.scroller, this.y);
      this.extend();
      this.schedule();
    });
  }

  finish(): void {
    window.removeEventListener("pointermove", this.onMove, true);
    window.removeEventListener("pointerup", this.onUp, true);
    window.removeEventListener("pointercancel", this.onCancel, true);
    window.removeEventListener("blur", this.onCancel);
    document.removeEventListener("selectstart", this.onSelectStart, true);
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.dragging = false;
  }
}

export const DocumentGapDragSelection = Extension.create({
  name: "documentGapDragSelection",
  // After DocumentBoundaryInteraction (1_000), which owns the paper tail and
  // object dismissal; before ProseMirror's own mousedown handling.
  priority: 900,

  addProseMirrorPlugins() {
    let active: GapDrag | null = null;
    return [new Plugin({
      key: documentGapDragSelectionKey,
      props: {
        handleDOMEvents: {
          mousedown(view, event) {
            if (event.button !== 0 || event.detail > 1 || !view.editable) return false;
            // A tap's compatibility mousedown arrives after its pointerup: a
            // drag started from it would wait for a release that has already
            // gone by (and swallow the next selectstart). A tap between
            
            if (isCompatMouseFromTouch(event)) return false;
            if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
            if (isImeCompositionActive(view, event)) return false;
            const target = event.target;
            if (!(target instanceof Element) || !target.matches(SHEET_SELECTOR) ||
                !view.dom.contains(target)) return false;
            // In the text column every press on the paper itself (between
            // blocks) is taken over; in the margins only one the browser
            // cannot anchor, so a margin drag keeps its native line picking.
            if (!insideTextColumn(target, event.clientX) &&
                caretPointIsText(event.clientX, event.clientY) !== false) return false;
            const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!hit) return false;
            event.preventDefault();
            active?.finish();
            active = new GapDrag(view, event.clientX, event.clientY, hit.pos);
            if (!view.hasFocus()) view.focus();
            return true;
          },
        },
      },
      view() {
        return {
          destroy() {
            active?.finish();
            active = null;
          },
        };
      },
    })];
  },
});

export default DocumentGapDragSelection;
