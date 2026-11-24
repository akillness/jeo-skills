"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Drag selection over equations and the other in-line objects, as Word makes
 * it.
 *
 * ## Microsoft behaviour this reproduces
 *
 * Word keeps an equation, and every "In Line with Text" picture, chart,
 * SmartArt graphic and shape, in the run of text like a character: a
 * selection dragged across one takes it whole and paints it in the selection
 * colour like the characters around it, whichever way the drag goes and
 * wherever it starts -- in text above or below, or on the empty part of the
 * object's own line (dragTargets: dragSelectionTargets.ts). A drag that
 * reaches a table from outside takes whole rows.
 *
 * An equation is a math zone: "Math Selection is like selection of ordinary
 * text, but if you select a math object start/end/separator delimiter, the
 * whole object is selected" (Murray Sargent, OfficeMath). A press on the
 * mathematics puts the insertion point there (the node view opens its editor
 * at that point; equationPress.ts); a drag that starts on the empty part of a
 * display equation's line and reaches the mathematics selects inside it from
 * that edge, as the math zone fills the line; and a drag that leaves the
 * math zone takes the whole of it with the text it reaches. A selected
 * equation is moved by dragging (Word moves a selection that is dragged),
 * except when it is only active after a click: then a drag selects.
 *
 * Word ends a selection at the paragraph mark of the last block object it
 * holds, so of stacked display equations (or pictures, charts) a drag takes
 * exactly those it passes. With no text between two of them such an end is
 * an EquationBoundarySelection (equationBoundarySelection.ts).
 *
 * ## Why MRAI needs this
 *
 * The objects are node views (`contenteditable=false`, `user-select: none`):
 * the browser paints no selection over them, cannot start a selection beside
 * them, and only crossed them going DOWN from text. So:
 *   • a node decoration (`data-in-selection`) marks every object a selection
 *     covers, and the CSS paints it;
 *   • every drag from text is followed: while the browser can make the
 *     selection itself it is left alone, and from the moment the pointer is
 *     on an object, a table reached from outside or the boundary beside an
 *     object, the selection is made here for the rest of the drag (the
 *     browser's own extension stops: its mousemove is cancelled, and its
 *     selection reads are put back in the same transaction);
 *   • a press beside a block object starts the same drag from that side;
 *   • a press off the lines of text (a table cell's empty space under its
 *     last line, a quote's or list item's padding, the paper between
 *     paragraphs) starts from the nearest line, and the document makes the
 *     selection from the first move: the browser puts its insertion point
 *     after the line's closing mark there, ProseMirror writes its own
 *     equivalent position back mid-press, and that write ends the browser's
 *     drag (the insertion point then only followed the pointer);
 *   • a drag from text whose browser selection stays collapsed while the
 *     pointer moves away is taken over the same way, whatever ended it.
 */

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  AllSelection,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
} from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

import { isImeCompositionActive } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import {
  EquationBoundarySelection,
  isTextRangeSelection,
  selectionBetweenEdges,
} from "@mrnote/core/web/components/console/editor/extensions/equationBoundarySelection.ts";
import {
  EQUATION_DRAG_OUT_EVENT,
  EQUATION_POINTER_SELECT_EVENT,
  pressOpensEquationEditor,
  type EquationDragOutDetail,
  type EquationPointerSelectDetail,
} from "./equationPress";
import {
  blockObjectBesidePress,
  isSelectionAtom,
  resolveDragSelection,
  selectionAcrossAtom,
  selectionAtomOfElement,
  PAGE_LEVEL_CONTAINERS,
  pointerOnLine,
  selectionEdgeNear,
  textPositionBesideLines,
  type SelectionAtom,
} from "./dragSelectionTargets";
import {
  MOVE_THRESHOLD_PX,
  autoScrollTowardPointer,
  pointerNearScrollEdge,
  scrollParentOf,
} from "./objectMove";

const EQUATION_NODE_NAMES = new Set(["mathBlock", "inlineMath"]);
const EQUATION_HOST_SELECTOR = ".math-block-wrapper, .inline-math-wrapper";
const EQUATION_PREVIEW_SELECTOR = ".math-block-preview, .inline-math-preview";

function isEquation(node: ProseMirrorNode | null | undefined): boolean {
  return Boolean(node && EQUATION_NODE_NAMES.has(node.type.name));
}

// ---------------------------------------------------------------------------
// Objects covered by the selection
// ---------------------------------------------------------------------------

/**
 * Equations and other in-line objects a text (or all) selection fully covers,
 * as node decorations.
 */
export function equationSelectionDecorations(
  state: EditorState,
): DecorationSet {
  const { selection, doc } = state;
  if (
    selection.empty ||
    !(isTextRangeSelection(selection) || selection instanceof AllSelection)
  ) {
    return DecorationSet.empty;
  }
  const decorations: Decoration[] = [];
  // The browser does not paint this selection (see its `visible`): its text
  // is painted here, in the selection colour.
  if (selection instanceof EquationBoundarySelection) {
    decorations.push(
      Decoration.inline(selection.from, selection.to, {
        class: "pm-equation-range-selection",
      }),
    );
  }
  for (const range of selection.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    doc.nodesBetween(from, to, (node, pos) => {
      if (!isSelectionAtom(node)) return true;
      if (pos >= from && pos + node.nodeSize <= to) {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            "data-in-selection": "true",
          }),
        );
      }
      return false;
    });
  }
  return decorations.length
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty;
}

// ---------------------------------------------------------------------------
// Drag-selecting from a selected equation
// ---------------------------------------------------------------------------

interface EquationSource {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/**
 * Which side a drag selection keeps fixed: `far` is the side away from the
 * pointer (a drag from the equation itself); `before` / `after` is the side
 * of the equation's line where a drag from its empty part began.
 */
export type EquationDragPin = "far" | "before" | "after";

/** The equation whose preview received `target`, if the press may select. */
function equationFromElement(
  view: EditorView,
  target: Element,
): EquationSource | null {
  if (!target.closest(EQUATION_PREVIEW_SELECTOR)) return null;
  const host = target.closest(EQUATION_HOST_SELECTOR);
  return host ? equationOfHost(view, host) : null;
}

function equationOfHost(
  view: EditorView,
  host: Element,
): EquationSource | null {
  if (!view.dom.contains(host)) return null;
  if (host.getAttribute("data-editing") === "true") return null;
  let pos: number;
  try {
    pos = view.posAtDOM(host, 0);
  } catch {
    return null;
  }
  for (const candidate of [pos, pos - 1]) {
    if (candidate < 0) continue;
    const node = view.state.doc.nodeAt(candidate);
    if (isEquation(node) && view.nodeDOM(candidate) === host) {
      return { pos: candidate, node: node as ProseMirrorNode };
    }
  }
  return null;
}

/**
 * The selection a drag from `source` to the document point `hit` makes: the
 * whole equation plus everything up to the pointer. Over the equation itself
 * the equation alone is selected. A drag from beside the equation (`pin`
 * `before` / `after`) keeps that side fixed instead, so it takes the equation
 * only when the pointer goes across it; back where it began it selects
 * nothing (null), leaving the insertion point the press put there.
 */
export function equationDragSelection(
  doc: ProseMirrorNode,
  source: EquationSource,
  hit: { pos: number; inside: number },
  pin: EquationDragPin = "far",
): Selection | null {
  const start = source.pos;
  const end = source.pos + source.node.nodeSize;
  // `inside` is the innermost node under the pointer: an atom there (this
  // equation, another one, a picture) is taken whole; any other node (the
  // paragraph under the text) leaves the plain text position.
  const over = hit.inside >= 0 ? doc.nodeAt(hit.inside) : null;
  const overAtom = over?.isAtom ? over : null;
  if (overAtom && hit.inside === start) return NodeSelection.create(doc, start);
  const forward = overAtom ? hit.inside >= end : hit.pos >= end;
  const head = overAtom
    ? forward
      ? hit.inside + overAtom.nodeSize
      : hit.inside
    : hit.pos;
  const anchorSide = pin === "far" ? (forward ? "before" : "after") : pin;
  const anchor =
    anchorSide === "before"
      ? selectionEdgeNear(doc, start, -1)
      : selectionEdgeNear(doc, end, 1);
  const headEdge = selectionEdgeNear(doc, head, forward ? 1 : -1);
  if (anchor === headEdge) {
    return pin === "far" ? NodeSelection.create(doc, start) : null;
  }
  return selectionBetweenEdges(doc, anchor, headEdge);
}

/**
 * The selection a text drag anchored at `anchor` makes with the pointer over
 * `equation`: from the anchor past the equation's far side.
 */
export function selectionExtendedOverEquation(
  doc: ProseMirrorNode,
  anchor: number,
  equation: EquationSource,
): Selection | null {
  return selectionAcrossAtom(doc, anchor, equation);
}

/**
 * The pointer a drag follows: its id, or any mouse when the press came as a
 * mousedown without a pointerdown (see `onMouseDown` below).
 */
type DragPointer = number | "mouse";

function isDragPointer(event: PointerEvent, pointer: DragPointer): boolean {
  return pointer === "mouse"
    ? event.pointerType === "mouse"
    : event.pointerId === pointer;
}

/** The click that follows a drag's release is not a click on what lies there. */
function swallowNextClick(): void {
  const swallowClick = (click: MouseEvent) => {
    click.preventDefault();
    click.stopPropagation();
  };
  window.addEventListener("click", swallowClick, { capture: true, once: true });
  window.setTimeout(
    () => window.removeEventListener("click", swallowClick, true),
    0,
  );
}

class EquationDragSelect {
  private active = false;
  private x: number;
  private y: number;
  private frame = 0;
  private readonly scroller: HTMLElement | null;

  constructor(
    private readonly view: EditorView,
    private readonly source: EquationSource,
    private readonly pointer: DragPointer,
    private readonly startX: number,
    private readonly startY: number,
    private readonly pin: EquationDragPin,
    private readonly onEnd: () => void,
    options: { readonly active?: boolean } = {},
  ) {
    this.x = startX;
    this.y = startY;
    this.scroller = scrollParentOf(view.dom);
    window.addEventListener("pointermove", this.onMove, true);
    window.addEventListener("pointerup", this.onUp, true);
    window.addEventListener("pointercancel", this.onCancel, true);
    window.addEventListener("blur", this.onCancel);
    // The browser must not start a selection of its own inside the preview.
    document.addEventListener("selectstart", this.onSelectStart, true);
    if (options.active) {
      // Handed over mid-drag (it left an open equation): already selecting.
      this.active = true;
      this.extend();
    }
  }

  /** Whether a native drag from `target` must yield to this gesture. */
  owns(target: Node): boolean {
    const dom = this.view.nodeDOM(this.source.pos);
    return dom instanceof Element && dom.contains(target);
  }

  private readonly onSelectStart = (event: Event) => {
    event.preventDefault();
  };

  private readonly onMove = (event: PointerEvent) => {
    if (!isDragPointer(event, this.pointer)) return;
    this.x = event.clientX;
    this.y = event.clientY;
    if (!this.active) {
      if (
        Math.hypot(this.x - this.startX, this.y - this.startY) <
        MOVE_THRESHOLD_PX
      ) {
        return;
      }
      this.active = true;
    }
    event.preventDefault();
    this.extend();
    this.schedule();
  };

  private readonly onUp = (event: PointerEvent) => {
    if (!isDragPointer(event, this.pointer)) return;
    if (!this.active) {
      this.finish();
      return;
    }
    event.preventDefault();
    this.x = event.clientX;
    this.y = event.clientY;
    this.extend();
    this.finish();
    swallowNextClick();
  };

  private readonly onCancel = (event?: Event) => {
    if (event instanceof PointerEvent && !isDragPointer(event, this.pointer)) {
      return;
    }
    this.finish();
  };

  /** The source again, found by identity if the document changed meanwhile. */
  private currentSource(): EquationSource | null {
    return equationInDoc(this.view.state.doc, this.source);
  }

  private extend(): void {
    const source = this.currentSource();
    if (!source) {
      this.finish();
      return;
    }
    const hit = this.view.posAtCoords({ left: this.x, top: this.y });
    if (!hit) return;
    const { state } = this.view;
    const selection = equationDragSelection(state.doc, source, hit, this.pin);
    if (!selection || state.selection.eq(selection)) return;
    this.view.dispatch(state.tr.setSelection(selection));
    if (!this.view.hasFocus()) this.view.focus();
  }

  private schedule(): void {
    if (this.frame || !pointerNearScrollEdge(this.scroller, this.y)) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.active) return;
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
    this.active = false;
    this.onEnd();
  }
}

// ---------------------------------------------------------------------------
// Drag-selecting a range: from text, or from beside a block object
// ---------------------------------------------------------------------------

/** Meta on the transactions the range drag dispatches itself. */
const RANGE_DRAG_META = "objectRangeDragSelection";

interface RangeDragOptions {
  /** Where the selection is anchored (a text position or an object boundary). */
  readonly anchor: number;
  /**
   * A drag from text: the browser selects by itself until the pointer
   * reaches what it cannot select. A drag from beside an object is the
   * document's from the start.
   */
  readonly lazy: boolean;
  /**
   * A press off the lines of text: the browser's own drag from there does
   * not survive, so the document makes the selection from the first move.
   */
  readonly engageOnMove: boolean;
  /**
   * The equation whose line the press was on, beside its mathematics: the
   * drag selects inside it once it reaches the mathematics.
   */
  readonly besideEquation: {
    readonly atom: SelectionAtom;
    readonly side: "before" | "after";
  } | null;
}

class RangeDragSelect {
  /** The pointer has moved past the threshold. */
  private moved = false;
  /** The document makes the selection (see `RangeDragOptions.lazy`). */
  engaged: boolean;
  /** The button is still down. */
  dragging = true;
  /** The selection this drag shows, while it is the document's. */
  desired: Selection | null = null;
  private x: number;
  private y: number;
  private frame = 0;
  /** Moves in a row on which the browser's selection was still collapsed. */
  private collapsedMoves = 0;
  private readonly scroller: HTMLElement | null;

  constructor(
    private readonly view: EditorView,
    private readonly pointer: DragPointer,
    private readonly startX: number,
    private readonly startY: number,
    private readonly options: RangeDragOptions,
    private readonly onEnd: (drag: RangeDragSelect) => void,
  ) {
    this.x = startX;
    this.y = startY;
    this.engaged = !options.lazy;
    this.scroller = scrollParentOf(view.dom);
    window.addEventListener("pointermove", this.onMove, true);
    window.addEventListener("mousemove", this.onMouseMove, true);
    window.addEventListener("pointerup", this.onUp, true);
    window.addEventListener("pointercancel", this.onCancel, true);
    window.addEventListener("blur", this.onCancel);
    window.addEventListener("dragstart", this.onDragStart, true);
    if (!options.lazy) {
      document.addEventListener("selectstart", this.onSelectStart, true);
    }
  }

  private readonly onSelectStart = (event: Event) => {
    event.preventDefault();
  };

  /** Once the document makes the selection, the browser's own stops. */
  private readonly onMouseMove = (event: MouseEvent) => {
    if (this.engaged && this.moved && event.buttons & 1) event.preventDefault();
  };

  private readonly onDragStart = (event: DragEvent) => {
    if (this.engaged) {
      // Nothing is dragged out of a selection being made.
      event.preventDefault();
      return;
    }
    // The browser is moving text that was already selected: not a selection.
    this.finish();
  };

  private readonly onMove = (event: PointerEvent) => {
    if (!isDragPointer(event, this.pointer)) return;
    if (!(event.buttons & 1)) {
      this.finish();
      return;
    }
    this.x = event.clientX;
    this.y = event.clientY;
    if (!this.moved) {
      if (
        Math.hypot(this.x - this.startX, this.y - this.startY) <
        MOVE_THRESHOLD_PX
      ) {
        return;
      }
      this.moved = true;
      if (this.options.engageOnMove) this.engaged = true;
    }
    if (this.engaged) event.preventDefault();
    this.extend();
    this.schedule();
  };

  private readonly onUp = (event: PointerEvent) => {
    if (!isDragPointer(event, this.pointer)) return;
    if (this.moved) {
      this.x = event.clientX;
      this.y = event.clientY;
      this.extend();
    }
    const engaged = this.engaged && this.moved;
    this.finish();
    if (engaged) swallowNextClick();
  };

  private readonly onCancel = (event?: Event) => {
    if (event instanceof PointerEvent && !isDragPointer(event, this.pointer)) {
      return;
    }
    this.finish();
  };

  private extend(): void {
    if (!this.dragging) return;
    const { view } = this;
    const { anchor } = this.options;
    if (anchor < 0 || anchor > view.state.doc.content.size) {
      this.finish();
      return;
    }
    const resolved = resolveDragSelection(view, anchor, this.x, this.y);
    if (!resolved) return;
    const beside = this.options.besideEquation;
    if (
      beside &&
      resolved.atom &&
      resolved.atom.node === beside.atom.node &&
      this.pointerOnMathematics(beside.atom)
    ) {
      this.handOverToEquation(beside);
      return;
    }
    if (resolved.needsDocument) this.engaged = true;
    if (!this.engaged) {
      // The browser is making this selection. One that stays collapsed while
      // the pointer is away from the anchor is a drag the browser lost (its
      // range was rewritten mid-press): two moves in a row say so, as one can
      // be a selection read not yet in.
      const collapsed =
        resolved.selection !== null &&
        !resolved.selection.empty &&
        view.state.selection.empty;
      this.collapsedMoves = collapsed ? this.collapsedMoves + 1 : 0;
      if (this.collapsedMoves < 2) return;
      this.engaged = true;
    }
    this.desired = resolved.selection;
    if (!resolved.selection) return;
    const { state } = view;
    if (state.selection.eq(resolved.selection)) return;
    view.dispatch(
      state.tr.setSelection(resolved.selection).setMeta(RANGE_DRAG_META, true),
    );
    if (!view.hasFocus()) view.focus();
  }

  private pointerOnMathematics(atom: SelectionAtom): boolean {
    const host = this.view.nodeDOM(atom.pos);
    const preview =
      host instanceof Element ? host.querySelector(EQUATION_PREVIEW_SELECTOR) : null;
    if (!preview) return false;
    const box = preview.getBoundingClientRect();
    return (
      this.x >= box.left &&
      this.x <= box.right &&
      this.y >= box.top &&
      this.y <= box.bottom
    );
  }

  /** The drag reached the mathematics: it selects inside the equation now. */
  private handOverToEquation(beside: NonNullable<RangeDragOptions["besideEquation"]>): void {
    const host = this.view.nodeDOM(beside.atom.pos);
    const { state } = this.view;
    const painted = this.desired !== null && !state.selection.empty;
    this.desired = null;
    this.finish();
    // The range the drag showed so far gives way to the selection inside.
    if (painted) {
      const caret = selectionBetweenEdges(state.doc, this.options.anchor, this.options.anchor);
      this.view.dispatch(state.tr.setSelection(caret).setMeta(RANGE_DRAG_META, true));
    }
    if (!(host instanceof Element)) return;
    const detail: EquationPointerSelectDetail = {
      x: this.x,
      y: this.y,
      edge: beside.side === "before" ? "start" : "end",
    };
    host.dispatchEvent(
      new CustomEvent(EQUATION_POINTER_SELECT_EVENT, { detail }),
    );
  }

  private schedule(): void {
    if (
      !this.engaged ||
      this.frame ||
      !pointerNearScrollEdge(this.scroller, this.y)
    ) {
      return;
    }
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.dragging) return;
      autoScrollTowardPointer(this.scroller, this.y);
      this.extend();
      this.schedule();
    });
  }

  finish(): void {
    if (!this.dragging) return;
    this.dragging = false;
    window.removeEventListener("pointermove", this.onMove, true);
    window.removeEventListener("mousemove", this.onMouseMove, true);
    window.removeEventListener("pointerup", this.onUp, true);
    window.removeEventListener("pointercancel", this.onCancel, true);
    window.removeEventListener("blur", this.onCancel);
    window.removeEventListener("dragstart", this.onDragStart, true);
    document.removeEventListener("selectstart", this.onSelectStart, true);
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (!this.moved) this.engaged = false;
    this.onEnd(this);
  }
}

const equationSelectionKey = new PluginKey<DecorationSet>(
  "documentEquationSelection",
);

/** `source` again in `doc`, found by identity if the document changed. */
function equationInDoc(
  doc: ProseMirrorNode,
  source: EquationSource,
): EquationSource | null {
  if (doc.nodeAt(source.pos) === source.node) return source;
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node === source.node) found = pos;
    return true;
  });
  return found === null ? null : { pos: found, node: source.node };
}

export const EquationSelection = Extension.create({
  name: "equationSelection",

  addProseMirrorPlugins() {
    /**
     * The range drag under way, or the last one until the next press:
     * WebKit reports the selection of the last move once more after the
     * button comes up, and that read must not undo the drag's selection.
     */
    let range: RangeDragSelect | null = null;
    return [
      new Plugin<DecorationSet>({
        key: equationSelectionKey,
        state: {
          init: (_config, state) => equationSelectionDecorations(state),
          apply: (tr, value, _oldState, newState) =>
            tr.docChanged || tr.selectionSet
              ? equationSelectionDecorations(newState)
              : value,
        },
        props: {
          decorations(state) {
            return equationSelectionKey.getState(state);
          },
        },
        // The browser re-reads its own drag selection after every move, and
        // for a pointer over an object it cannot select into that selection
        // stops short of it (or collapses); put the drag's selection back in
        // the same transaction, so the read never lands.
        appendTransaction(transactions, _oldState, newState) {
          const drag = range;
          if (!drag?.engaged || !drag.desired) return null;
          if (transactions.some((tr) => tr.docChanged)) return null;
          // Only the browser's reads: another plugin's normalisation of the
          // drag's own selection (the table plugin's, for one ending at a
          // cell's start) is appended to it, and putting the drag's selection
          // back over that would have the two answer each other forever.
          const foreignRead = transactions.some(
            (tr) =>
              tr.selectionSet &&
              !tr.getMeta(RANGE_DRAG_META) &&
              !tr.getMeta("appendedTransaction") &&
              (drag.dragging || tr.getMeta("pointer")),
          );
          if (!foreignRead) return null;
          const desired = drag.desired;
          if (desired.$anchor.doc !== newState.doc) return null;
          if (newState.selection.eq(desired)) return null;
          return newState.tr.setSelection(desired).setMeta(RANGE_DRAG_META, true);
        },
        view(view) {
          let gesture: EquationDragSelect | null = null;
          const endRange = () => {
            range?.finish();
            range = null;
          };
          const armEquation = (
            source: EquationSource,
            pin: EquationDragPin,
            x: number,
            y: number,
            pointer: DragPointer,
            options?: { active?: boolean },
          ) => {
            gesture = new EquationDragSelect(
              view,
              source,
              pointer,
              x,
              y,
              pin,
              () => {
                gesture = null;
              },
              options,
            );
          };
          const armRange = (
            event: MouseEvent,
            pointer: DragPointer,
            options: RangeDragOptions,
          ) => {
            range = new RangeDragSelect(
              view,
              pointer,
              event.clientX,
              event.clientY,
              options,
              () => {
                // Kept (not cleared) for WebKit's late read; see `range`.
              },
            );
          };
          const onPress = (event: MouseEvent, pointer: DragPointer) => {
            gesture?.finish();
            endRange();
            if (
              event.button !== 0 ||
              ("pointerType" in event && event.pointerType === "touch") ||
              event.shiftKey ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey ||
              event.detail > 1 ||
              !view.editable ||
              isImeCompositionActive(view)
            ) {
              return;
            }
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (!view.dom.contains(target)) return;
            // The press opens the equation's editor at that point (Word); the
            // range gesture is for presses beside or across equations.
            if (pressOpensEquationEditor(target, event)) return;
            // An open equation selects inside itself; an object's own
            // controls and fields keep their presses.
            if (target.closest("[data-editing='true']")) return;
            const editable = target.closest("[contenteditable='true']");
            if (editable && editable !== view.dom) return;
            if (target.closest("button, input, textarea, select")) return;
            // A drawing's own grips (a chart element's sizing handles) own
            // their gesture even where they overhang the drawing's edge, onto
            // the empty part of its line.
            if (target.closest("[data-document-selection-chrome]")) return;
            const source = equationFromElement(view, target);
            if (source) {
              // An equation inside a selection that holds more than the
              // equation is dragged to be MOVED, as Word moves a selection.
              // The equation alone selected is only active (a click made it
              // so; in Word the insertion point is inside it), and a drag
              // from there selects.
              const { selection } = view.state;
              const activeAlone =
                selection instanceof NodeSelection &&
                selection.from === source.pos;
              if (
                !activeAlone &&
                !selection.empty &&
                selection.from <= source.pos &&
                selection.to >= source.pos + source.node.nodeSize
              ) {
                return;
              }
              armEquation(source, "far", event.clientX, event.clientY, pointer);
              return;
            }
            const { doc } = view.state;
            // The empty part of a block object's own line: the node view puts
            // the insertion point on that side; a drag selects from there.
            const beside = blockObjectBesidePress(
              view,
              target,
              event.clientX,
              event.clientY,
            );
            if (beside) {
              const { atom, side } = beside;
              const anchor =
                side === "before"
                  ? selectionEdgeNear(doc, atom.pos, -1)
                  : selectionEdgeNear(doc, atom.pos + atom.node.nodeSize, 1);
              armRange(event, pointer, {
                anchor,
                lazy: false,
                engageOnMove: false,
                // Only a press on the equation's own line is inside its math
                // zone (Word's display math fills its line); one on the paper
                // below or above it reaches the whole equation, as from text.
                besideEquation: isEquation(atom.node) && beside.level ? beside : null,
              });
              return;
            }
            // The object itself: pressed to select or move it.
            if (selectionAtomOfElement(view, target)) return;
            const hit = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            if (!hit) return;
            // Off the lines of text inside a block that holds lines (a cell,
            // a quote, a list item): from the nearest line of that block, and
            // the document's from the first move. The paper between the
            // page's own blocks is DocumentGapDragSelection's.
            const $hit = doc.resolve(hit.pos);
            const betweenLines = !$hit.parent.inlineContent;
            if (betweenLines && PAGE_LEVEL_CONTAINERS.has($hit.parent.type.name)) {
              return;
            }
            // In a paragraph but above or below its line (its spacing, under
            // its last line): on that line at the pointer's x, and the
            // document's from the first move, as the browser's drag from
            // there does not survive in WebKit.
            const onLine = betweenLines
              ? null
              : pointerOnLine(view, hit.pos, event.clientX, event.clientY);
            const anchor = onLine
              ? onLine.pos
              : textPositionBesideLines(view, hit.pos, event.clientX, event.clientY);
            if (anchor === null) return;
            // A press inside a selection drags the selection (to move it).
            const { selection } = view.state;
            if (
              !selection.empty &&
              anchor >= selection.from &&
              anchor <= selection.to
            ) {
              return;
            }
            armRange(event, pointer, {
              anchor,
              lazy: true,
              engageOnMove: onLine ? onLine.offLine : true,
              besideEquation: null,
            });
          };
          let pointerPressAt = -Infinity;
          const onPointerDown = (event: PointerEvent) => {
            pointerPressAt = event.timeStamp;
            onPress(event, event.pointerId);
          };
          // A press WebKit still counts as a second button (right after a
          // drag and drop swallowed the release) comes as a mousedown with no
          // pointerdown before it; its moves are pointermoves of the mouse.
          const onMouseDown = (event: MouseEvent) => {
            if (event.timeStamp - pointerPressAt < 100) return;
            onPress(event, "mouse");
          };
          const onDragStart = (event: DragEvent) => {
            // Chromium starts the drag of a selected in-line equation from
            // the text inside it, so the target need not be an element.
            if (
              gesture &&
              event.target instanceof Node &&
              gesture.owns(event.target)
            ) {
              event.preventDefault();
              event.stopPropagation();
            }
          };
          // A drag that selects inside an open equation has left it.
          const onEquationDragOut = (event: Event) => {
            const detail = (event as CustomEvent<EquationDragOutDetail>).detail;
            if (!detail || !view.editable) return;
            const node = view.state.doc.nodeAt(detail.pos);
            if (!isEquation(node)) return;
            gesture?.finish();
            endRange();
            armEquation(
              { pos: detail.pos, node: node as ProseMirrorNode },
              "far",
              detail.x,
              detail.y,
              detail.pointerId,
              { active: true },
            );
          };
          view.dom.addEventListener("pointerdown", onPointerDown, true);
          view.dom.addEventListener("mousedown", onMouseDown, true);
          view.dom.addEventListener("dragstart", onDragStart, true);
          view.dom.addEventListener(EQUATION_DRAG_OUT_EVENT, onEquationDragOut);
          return {
            destroy() {
              gesture?.finish();
              endRange();
              view.dom.removeEventListener("pointerdown", onPointerDown, true);
              view.dom.removeEventListener("mousedown", onMouseDown, true);
              view.dom.removeEventListener("dragstart", onDragStart, true);
              view.dom.removeEventListener(EQUATION_DRAG_OUT_EVENT, onEquationDragOut);
            },
          };
        },
      }),
    ];
  },
});

export default EquationSelection;
