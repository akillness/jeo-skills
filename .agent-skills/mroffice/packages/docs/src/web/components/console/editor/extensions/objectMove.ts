"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Object MOVE — drag a picture, chart, shape or SmartArt that stands "In Line
 * with Text" to another place in the text, as Word moves it.
 *
 * ## Microsoft behaviour this reproduces
 *
 * Word ("Wrap text and move pictures in Word"): an object In Line with Text is
 * "treated like any text character". Dragging it shows a dotted insertion
 * point that follows the pointer through the text; releasing moves the object
 * to that insertion point, onto that line. The paragraph it came from keeps
 * its paragraph mark, so a line the object stood on alone stays as an empty
 * line. A floating object is dragged to a POSITION instead — that is its own
 * node view's gesture and is not handled here.
 *
 * ## MRAI spelling
 *
 * An object alone on its line is the block node (`image`, `chart`, a
 * `documentShape` wrapped "inline"); one sharing a line with text is the
 * inline atom (`inlineImage`, `inlineChart`) — see `objectPlacement.ts`. So a
 * drop:
 *   • into a line of text inserts the inline form at that insertion point;
 *   • on an empty line fills that paragraph with the inline form;
 *   • beside another block object (or between pictures of one row) makes it
 *     a line of its own there.
 * A shape never goes beneath a list (it could not be saved there): dropped
 * on a list line it takes a line of its own beside the whole list.
 *
 * The gesture is pointer-driven rather than HTML drag and drop: the React
 * chart view and the shape canvas cancel native drags, a native drag cannot
 * draw Word's insertion point, and the drop has to change the object's
 * placement on the way. A native `dragstart` from an object this gesture has
 * taken is cancelled, so the two never race. A press that does not travel
 * past the threshold is an ordinary click (select, open, crop, ...).
 *
 * ## Touch
 *
 * Office's touch rule (Office Touch Guide: tap the object, then hold and
 * drag): a finger swiped across a picture scrolls the page; a finger held
 * still on it for 300 ms lifts it, and then the same gesture moves it. A
 * picture that is already selected moves at once. The arbitration is the
 * shared object drag gesture (lib/object-drag-gesture.ts): it keeps the
 * browser from scrolling once the object is lifted and rolls the move back
 * on a pointercancel or a second finger. On a coarse-pointer device every
 * movable object carries its touch guard, installed lazily after each
 * document change; a desktop never pays for it.
 */

import { Extension } from "@tiptap/core";
import { pressOpensEquationEditor } from "./equationPress";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode, NodeType } from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import {
  beginObjectDragGesture,
  installObjectDragTouchGuard,
  type ObjectDragGesture,
} from "@mrnote/core/web/lib/object-drag-gesture.ts";
import {
  deviceCanHover,
  deviceHasTouch,
  devicePointerIsCoarse,
  isTouchLikePointer,
} from "@mrnote/core/web/lib/pointer-capability.ts";

import {
  BLOCK_PICTURE_NODE_NAME,
  isInlineDrawingNode,
  isShapeNode,
} from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import { documentShapeBoundaryOutsideList } from "@mrnote/core/web/components/console/editor/native-document/documentShapeInsertion.ts";
import { isImeCompositionActive } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import { isSuggestingActive } from "@mrnote/core/web/components/console/editor/native-document/trackChangesExtension.ts";
import { clipToVisibleEditor } from "@mrnote/core/web/components/console/editor/native-document/visibleEditorClip.ts";
import {
  inlineFormOfBlockObject,
  inLineBlockObjectKind,
  paragraphHoldingRuns,
  vacatedObjectLine,
} from "@mrnote/core/web/components/console/editor/extensions/objectPlacement.ts";

/** The object being moved, where it is now. */
export interface ObjectMoveSource {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  /** An inline atom on a text line (vs. a block alone on its line). */
  readonly inline: boolean;
  /** A picture of a multi-picture row (`imageRow`). */
  readonly rowMember: boolean;
}

/** Where a drop puts the object. */
export type ObjectDropTarget =
  /** An insertion point inside a line of text. */
  | { readonly kind: "text"; readonly pos: number }
  /** An empty paragraph (its position); the object fills that line. */
  | { readonly kind: "emptyLine"; readonly pos: number }
  /** A boundary between blocks; the object takes a line of its own. */
  | { readonly kind: "block"; readonly pos: number };

/** Pointer travel (px) before a press becomes a move, as ProseMirror's own. */
export const MOVE_THRESHOLD_PX = 4;
/** Distance (px) from the scroller's edge at which a move scrolls. */
const AUTO_SCROLL_EDGE_PX = 40;
const AUTO_SCROLL_MAX_STEP_PX = 18;

/** The DOM hosts of the objects this gesture moves. */
const MOVABLE_OBJECT_SELECTOR = [
  ".note-editor-image-resizable",
  ".node-chart",
  ".node-inlineChart",
  "[data-document-shape]",
].join(", ");

/**
 * Presses that belong to the object's own controls: resize/crop/rotate grips,
 * form fields, a label being edited, an equation or text box being typed in.
 */
const OBJECT_CONTROL_SELECTOR = [
  "[data-document-selection-chrome]",
  ".note-editor-image-handle",
  ".note-editor-image-crop-handle",
  "[data-document-connector-label]",
  "button",
  "input",
  "textarea",
  "select",
  "a[href]",
  "[contenteditable='true']",
].join(", ");

// ---------------------------------------------------------------------------
// The object under a press.
// ---------------------------------------------------------------------------

/** The movable object at `pos`, or `null` (floating, equation, text, ...). */
export function objectMoveSourceAt(
  doc: ProseMirrorNode,
  pos: number,
): ObjectMoveSource | null {
  if (!Number.isInteger(pos) || pos < 0 || pos >= doc.content.size) return null;
  const node = doc.nodeAt(pos);
  if (!node) return null;
  if (isInlineDrawingNode(node)) {
    return { pos, node, inline: true, rowMember: false };
  }
  const $pos = doc.resolve(pos);
  const rowMember =
    node.type.name === BLOCK_PICTURE_NODE_NAME &&
    $pos.parent.type.name === "imageRow";
  const kind = inLineBlockObjectKind(node);
  // An equation is edited where it is clicked; it moves by cut and paste.
  if (!rowMember && (!kind || kind === "equation" || kind === "pictureRow")) {
    return null;
  }
  return { pos, node, inline: false, rowMember };
}

/**
 * The box the object is drawn in. A block chart's or shape's host spans the
 * whole line; a press in the free space beside the drawing is a caret
 * placement (objectPlacement.ts), never a move.
 */
function drawnBoxOf(host: Element): Element {
  return (
    host.querySelector(":scope > .chart-block-wrapper") ??
    host.querySelector("[data-document-shape-canvas]") ??
    host
  );
}

function sourceFromElement(
  view: EditorView,
  element: Element,
  point: { x: number; y: number },
): ObjectMoveSource | null {
  const host = element.closest(MOVABLE_OBJECT_SELECTOR);
  if (!host || !view.dom.contains(host) || host === view.dom) return null;
  const box = drawnBoxOf(host).getBoundingClientRect();
  if (
    point.x < box.left ||
    point.x > box.right ||
    point.y < box.top ||
    point.y > box.bottom
  ) {
    return null;
  }
  let pos: number;
  try {
    pos = view.posAtDOM(host, 0);
  } catch {
    return null;
  }
  for (const candidate of [pos, pos - 1]) {
    if (candidate >= 0 && view.nodeDOM(candidate) === host) {
      return objectMoveSourceAt(view.state.doc, candidate);
    }
  }
  return null;
}

/**
 * Whether a press on `target` belongs to the object's own controls. Only
 * elements INSIDE the object count: the editor root is itself
 * `contenteditable="true"`.
 */
function pressBelongsToControl(target: Element): boolean {
  const host = target.closest(MOVABLE_OBJECT_SELECTOR);
  if (!host) return false;
  const control = target.closest(OBJECT_CONTROL_SELECTOR);
  if (control && host.contains(control)) return true;
  if (host.matches("[data-picture-crop-mode='true']")) return true;
  const shape = host.matches("[data-document-shape]")
    ? (host as HTMLElement)
    : null;
  if (shape) {
    if (shape.dataset.textEditing === "true") return true;
    // A member of an editable SmartArt/group is dragged INSIDE the diagram
    // (the node view's own gesture); the frame between members moves it.
    if (
      shape.dataset.preserveOnly !== "true" &&
      target.closest("[data-document-shape-group-member]")
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Where a drop lands.
// ---------------------------------------------------------------------------

function sourceEnd(source: ObjectMoveSource): number {
  return source.pos + source.node.nodeSize;
}

/** The node type the object takes on a text line, if it has one. */
function inlineTypeOf(
  view: EditorView,
  source: ObjectMoveSource,
): NodeType | null {
  if (source.inline) return source.node.type;
  const form = inlineFormOfBlockObject(view.state.schema, source.node);
  return form?.runs.length === 1 ? form.runs[0]!.type : null;
}

/** The node type the object takes on a line of its own. */
function blockTypeOf(
  view: EditorView,
  source: ObjectMoveSource,
): NodeType | null {
  return source.inline
    ? (view.state.schema.nodes.paragraph ?? null)
    : source.node.type;
}

/**
 * A line of its own at the block boundary `pos`, or — where that container
 * cannot hold the object (a list item, say) — at the same side of the
 * nearest enclosing block that can.
 */
function blockTarget(
  view: EditorView,
  source: ObjectMoveSource,
  pos: number,
  side: "before" | "after" = "before",
): ObjectDropTarget | null {
  const type = blockTypeOf(view, source);
  if (!type) return null;
  const { doc } = view.state;
  let $pos = doc.resolve(pos);
  if ($pos.parent.inlineContent) return null;
  // A shape cannot be saved beneath a list: it goes beside the whole list.
  if (isShapeNode(source.node)) {
    const outside = documentShapeBoundaryOutsideList($pos, side);
    if (outside !== null) $pos = doc.resolve(outside);
  }
  for (;;) {
    const at = $pos.pos;
    // Right where it already stands.
    if (!source.inline && at >= source.pos && at <= sourceEnd(source)) {
      return null;
    }
    if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), type)) {
      return { kind: "block", pos: at };
    }
    if ($pos.depth === 0) return null;
    $pos = doc.resolve(side === "before" ? $pos.before() : $pos.after());
  }
}

function textTarget(
  view: EditorView,
  source: ObjectMoveSource,
  pos: number,
): ObjectDropTarget | null {
  const $pos = view.state.doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.inlineContent || $pos.depth === 0) return null;
  if (pos > source.pos && pos < sourceEnd(source)) return null;
  if (source.inline && (pos === source.pos || pos === sourceEnd(source))) {
    return null;
  }
  const inlineType = inlineTypeOf(view, source);
  const shapeInList =
    isShapeNode(source.node) &&
    documentShapeBoundaryOutsideList($pos, "before") !== null;
  if (
    inlineType &&
    !shapeInList &&
    parent.canReplaceWith($pos.index(), $pos.index(), inlineType)
  ) {
    return parent.content.size === 0
      ? { kind: "emptyLine", pos: $pos.before() }
      : { kind: "text", pos };
  }
  // No inline form here (a shape on a list line; a line that holds no
  // drawings): a line of its own at the nearer end of this paragraph.
  const nearerStart = $pos.parentOffset <= parent.content.size / 2;
  return blockTarget(
    view,
    source,
    nearerStart ? $pos.before() : $pos.after(),
    nearerStart ? "before" : "after",
  );
}

/** Where releasing the pointer at (`left`, `top`) would put `source`. */
export function resolveObjectDropTarget(
  view: EditorView,
  source: ObjectMoveSource,
  coords: { left: number; top: number },
): ObjectDropTarget | null {
  const hit = view.posAtCoords(coords);
  if (!hit) return null;
  const { doc } = view.state;
  if (hit.inside >= 0) {
    const over = doc.nodeAt(hit.inside);
    if (over && over.isAtom && !over.isText) {
      if (hit.inside === source.pos) return null;
      const dom = view.nodeDOM(hit.inside);
      const rect = dom instanceof Element ? dom.getBoundingClientRect() : null;
      if (over.isInline) {
        const after = rect ? coords.left > rect.left + rect.width / 2 : false;
        return textTarget(
          view,
          source,
          after ? hit.inside + over.nodeSize : hit.inside,
        );
      }
      const after = rect ? coords.top > rect.top + rect.height / 2 : false;
      return blockTarget(
        view,
        source,
        after ? hit.inside + over.nodeSize : hit.inside,
        after ? "after" : "before",
      );
    }
  }
  const $pos = doc.resolve(hit.pos);
  return $pos.parent.inlineContent
    ? textTarget(view, source, hit.pos)
    : blockTarget(view, source, hit.pos);
}

// ---------------------------------------------------------------------------
// The move itself.
// ---------------------------------------------------------------------------

/**
 * Move `source` to `target` in one undoable step and select it there.
 * Returns false (and changes nothing) when the move cannot be expressed.
 */
export function moveObjectTo(
  view: EditorView,
  source: ObjectMoveSource,
  target: ObjectDropTarget,
): boolean {
  if (!view.editable || isSuggestingActive(view.state)) return false;
  const { node } = source;
  if (view.state.doc.nodeAt(source.pos) !== node) return false;
  // Undo restores the selection the move started from: make that the object
  // itself, so Undo puts it back selected where it was (as Word does), not a
  // caret somewhere else in the document.
  if (
    !(view.state.selection instanceof NodeSelection) ||
    view.state.selection.from !== source.pos
  ) {
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, source.pos)),
    );
  }
  const state = view.state;

  let payload: ProseMirrorNode | null;
  let selectOffset = 0;
  if (target.kind === "block") {
    payload = source.inline ? paragraphHoldingRuns(state, [node]) : node;
    if (source.inline) selectOffset = 1;
  } else if (source.inline) {
    payload = node;
  } else {
    const form = inlineFormOfBlockObject(state.schema, node);
    payload = form?.runs.length === 1 ? form.runs[0]! : null;
  }
  if (!payload) return false;

  const tr = closeHistory(state.tr);
  // 1. Take the object out. The line it stood on keeps its paragraph mark.
  const end = sourceEnd(source);
  if (source.inline) {
    tr.delete(source.pos, end);
  } else if (source.rowMember) {
    const $source = state.doc.resolve(source.pos);
    const row = $source.parent;
    if (row.childCount > 1) {
      tr.delete(source.pos, end);
    } else {
      const line = vacatedObjectLine(state, row);
      const rowPos = $source.before();
      if (line) tr.replaceWith(rowPos, rowPos + row.nodeSize, line);
      else tr.delete(rowPos, rowPos + row.nodeSize);
    }
  } else {
    const line = vacatedObjectLine(state, node);
    const $source = state.doc.resolve(source.pos);
    if (
      line &&
      $source.parent.canReplaceWith($source.index(), $source.index() + 1, line.type)
    ) {
      tr.replaceWith(source.pos, end, line);
    } else {
      tr.delete(source.pos, end);
    }
  }
  // 2. Put it at the insertion point.
  const insertAt =
    target.kind === "emptyLine"
      ? tr.mapping.map(target.pos) + 1
      : tr.mapping.map(target.pos);
  try {
    tr.insert(insertAt, payload);
    tr.setSelection(NodeSelection.create(tr.doc, insertAt + selectOffset));
  } catch {
    return false;
  }
  view.dispatch(tr);
  if (!view.hasFocus()) view.focus();
  return true;
}

// ---------------------------------------------------------------------------
// The pointer gesture.
// ---------------------------------------------------------------------------

/** The dotted insertion point Word draws while an object is dragged. */
function dropCaretRect(
  view: EditorView,
  target: ObjectDropTarget,
): { left: number; top: number; width: number; height: number } | null {
  if (target.kind === "block") {
    const $pos = view.state.doc.resolve(target.pos);
    const after = $pos.nodeAfter ? view.nodeDOM(target.pos) : null;
    const before = $pos.nodeBefore
      ? view.nodeDOM(target.pos - $pos.nodeBefore.nodeSize)
      : null;
    const neighbour =
      after instanceof Element
        ? after.getBoundingClientRect()
        : before instanceof Element
          ? before.getBoundingClientRect()
          : null;
    if (!neighbour) return null;
    const y = after instanceof Element ? neighbour.top - 2 : neighbour.bottom + 1;
    return { left: neighbour.left, top: y, width: neighbour.width, height: 0 };
  }
  const pos = target.kind === "emptyLine" ? target.pos + 1 : target.pos;
  try {
    const coords = view.coordsAtPos(pos);
    return {
      left: coords.left,
      top: coords.top,
      width: 0,
      height: Math.max(12, coords.bottom - coords.top),
    };
  } catch {
    return null;
  }
}

/** Whether a pointer at `y` is close enough to the scroller's edge to scroll. */
export function pointerNearScrollEdge(
  scroller: HTMLElement | null,
  y: number,
): boolean {
  const bounds = scroller?.getBoundingClientRect() ?? {
    top: 0,
    bottom: window.innerHeight,
  };
  return (
    y < bounds.top + AUTO_SCROLL_EDGE_PX ||
    y > bounds.bottom - AUTO_SCROLL_EDGE_PX
  );
}

/** One step of the edge auto-scroll a pointer gesture drives (per frame). */
export function autoScrollTowardPointer(
  scroller: HTMLElement | null,
  y: number,
): void {
  const bounds = scroller?.getBoundingClientRect() ?? {
    top: 0,
    bottom: window.innerHeight,
  };
  let step = 0;
  if (y < bounds.top + AUTO_SCROLL_EDGE_PX) {
    step = -Math.min(AUTO_SCROLL_MAX_STEP_PX, bounds.top + AUTO_SCROLL_EDGE_PX - y);
  } else if (y > bounds.bottom - AUTO_SCROLL_EDGE_PX) {
    step = Math.min(
      AUTO_SCROLL_MAX_STEP_PX,
      y - (bounds.bottom - AUTO_SCROLL_EDGE_PX),
    );
  }
  if (!step) return;
  if (scroller) scroller.scrollTop += step;
  else window.scrollBy(0, step);
}

export function scrollParentOf(element: Element): HTMLElement | null {
  for (
    let node: Element | null = element.parentElement;
    node;
    node = node.parentElement
  ) {
    if (!(node instanceof HTMLElement)) continue;
    const overflow = getComputedStyle(node).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return null;
}

class ObjectMoveGesture {
  private active = false;
  private x: number;
  private y: number;
  private caret: HTMLElement | null = null;
  private frame = 0;
  private readonly scroller: HTMLElement | null;

  constructor(
    private readonly view: EditorView,
    private readonly source: ObjectMoveSource,
    private readonly pointerId: number,
    private readonly startX: number,
    private readonly startY: number,
    private readonly onEnd: () => void,
  ) {
    this.x = startX;
    this.y = startY;
    this.scroller = scrollParentOf(view.dom);
    window.addEventListener("pointermove", this.onMove, true);
    window.addEventListener("pointerup", this.onUp, true);
    window.addEventListener("pointercancel", this.onCancel, true);
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("blur", this.onCancel);
  }

  /** Whether a native drag from `element` must yield to this gesture. */
  owns(element: Element): boolean {
    const dom = this.view.nodeDOM(this.source.pos);
    return dom instanceof Element && dom.contains(element);
  }

  private readonly onMove = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    this.x = event.clientX;
    this.y = event.clientY;
    if (!this.active) {
      if (
        Math.hypot(this.x - this.startX, this.y - this.startY) <
        MOVE_THRESHOLD_PX
      ) {
        return;
      }
      if (!this.view.editable || isSuggestingActive(this.view.state)) {
        this.finish();
        return;
      }
      this.activate();
    }
    event.preventDefault();
    this.schedule();
  };

  private readonly onUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    if (!this.active) {
      this.finish();
      return;
    }
    event.preventDefault();
    const source = this.currentSource();
    const target = source
      ? resolveObjectDropTarget(this.view, source, { left: this.x, top: this.y })
      : null;
    this.finish();
    // The click that follows the release is not a click on what lies there.
    const swallowClick = (click: MouseEvent) => {
      click.preventDefault();
      click.stopPropagation();
    };
    window.addEventListener("click", swallowClick, { capture: true, once: true });
    window.setTimeout(
      () => window.removeEventListener("click", swallowClick, true),
      0,
    );
    if (source && target) moveObjectTo(this.view, source, target);
  };

  private readonly onCancel = (event?: Event) => {
    if (event instanceof PointerEvent && event.pointerId !== this.pointerId) {
      return;
    }
    this.finish();
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !this.active) return;
    event.preventDefault();
    event.stopPropagation();
    this.finish();
  };

  /** The source again, found by identity if the document changed meanwhile. */
  private currentSource(): ObjectMoveSource | null {
    const { doc } = this.view.state;
    if (doc.nodeAt(this.source.pos) === this.source.node) {
      return objectMoveSourceAt(doc, this.source.pos);
    }
    let found: number | null = null;
    doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node === this.source.node) found = pos;
      return true;
    });
    return found === null ? null : objectMoveSourceAt(doc, found);
  }

  private activate(): void {
    this.active = true;
    const dom = this.view.nodeDOM(this.source.pos);
    if (dom instanceof HTMLElement) dom.dataset.objectMoving = "true";
    this.view.dom.ownerDocument.body.classList.add("note-editor-object-moving");
    const caret = this.view.dom.ownerDocument.createElement("div");
    caret.className = "note-editor-object-drop-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.hidden = true;
    // Drawn outside the editor's themed subtree: take the text colour along.
    caret.style.color = getComputedStyle(this.view.dom).color;
    this.view.dom.ownerDocument.body.append(caret);
    this.caret = caret;
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.active) return;
      this.autoScroll();
      this.paint();
      if (this.nearScrollEdge()) this.schedule();
    });
  }

  private nearScrollEdge(): boolean {
    return pointerNearScrollEdge(this.scroller, this.y);
  }

  private autoScroll(): void {
    autoScrollTowardPointer(this.scroller, this.y);
  }

  private paint(): void {
    const caret = this.caret;
    if (!caret) return;
    const source = this.currentSource();
    const target = source
      ? resolveObjectDropTarget(this.view, source, { left: this.x, top: this.y })
      : null;
    const drop = target ? dropCaretRect(this.view, target) : null;
    // Only the part the page shows: the caret is drawn on the body, past
    // the scroller's clipping (visibleEditorClip.ts).
    const rect = drop ? clipToVisibleEditor(this.view.dom, drop) : null;
    if (!rect) {
      caret.hidden = true;
      return;
    }
    caret.hidden = false;
    caret.dataset.orientation = rect.height > 0 ? "vertical" : "horizontal";
    caret.style.left = `${rect.left}px`;
    caret.style.top = `${rect.top}px`;
    caret.style.width = `${rect.width}px`;
    caret.style.height = `${rect.height}px`;
  }

  finish(): void {
    window.removeEventListener("pointermove", this.onMove, true);
    window.removeEventListener("pointerup", this.onUp, true);
    window.removeEventListener("pointercancel", this.onCancel, true);
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("blur", this.onCancel);
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.active) {
      this.active = false;
      this.caret?.remove();
      this.caret = null;
      this.view.dom.ownerDocument.body.classList.remove(
        "note-editor-object-moving",
      );
      this.view.dom
        .querySelectorAll<HTMLElement>("[data-object-moving]")
        .forEach((element) => delete element.dataset.objectMoving);
    }
    this.onEnd();
  }
}

const objectMoveKey = new PluginKey("documentObjectMove");

export const ObjectMove = Extension.create({
  name: "objectMove",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: objectMoveKey,
        view(view) {
          let gesture: ObjectMoveGesture | null = null;
          /** A finger's press, waiting to lift the object (touch only). */
          let lift: ObjectDragGesture | null = null;
          const onPointerDown = (event: PointerEvent) => {
            gesture?.finish();
            lift?.cancel("aborted");
            lift = null;
            if (
              !view.editable ||
              event.button !== 0 ||
              event.shiftKey ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey ||
              event.detail > 1 ||
              isSuggestingActive(view.state) ||
              isImeCompositionActive(view)
            ) {
              return;
            }
            const target = event.target;
            if (!(target instanceof Element) || pressBelongsToControl(target)) {
              return;
            }
            // The press opens the equation's editor at that point (Word).
            if (pressOpensEquationEditor(target, event)) return;
            const source = sourceFromElement(view, target, {
              x: event.clientX,
              y: event.clientY,
            });
            if (!source) return;
            // A press inside a larger text selection drags that selection.
            const { selection } = view.state;
            if (
              selection instanceof TextSelection &&
              !selection.empty &&
              selection.from <= source.pos &&
              selection.to >= sourceEnd(source)
            ) {
              return;
            }
            const startGesture = () =>
              new ObjectMoveGesture(
                view,
                source,
                event.pointerId,
                event.clientX,
                event.clientY,
                () => {
                  gesture = null;
                  // Escape, or a drop: the lift is over too
                  lift?.cancel("aborted");
                  lift = null;
                },
              );
            if (!isTouchLikePointer(event)) {
              gesture = startGesture();
              return;
            }
            // A finger: a selected object moves at once, any other after a
            // still hold; a swipe scrolls, a quick release is a tap. A block
            // chart always waits for the hold: its host spans the line, and
            // a swipe over a selected chart scrolls the page (Office: tap,
            // hold, then drag; a swipe scrolls).
            const { selection: current } = view.state;
            const selected =
              current instanceof NodeSelection &&
              current.from === source.pos &&
              source.node.type.name !== "chart";
            const host = view.nodeDOM(source.pos);
            // this press, while it is the current one (a later press ends it)
            const press = { live: true };
            const pressed = beginObjectDragGesture(
              event,
              {
                onLift: () => {
                  if (press.live) gesture = startGesture();
                },
                // the move gesture follows the pointer itself
                onMove: () => {},
                onEnd: () => {
                  press.live = false;
                },
                onCancel: (reason) => {
                  press.live = false;
                  // the browser took the touch, or a second finger: no drop
                  if (reason !== "aborted") gesture?.finish();
                },
              },
              {
                element: host instanceof Element ? host : null,
                immediate: selected,
                escapeCancels: false,
              },
            );
            lift = press.live ? pressed : null;
          };
          const onDragStart = (event: DragEvent) => {
            if (
              gesture &&
              event.target instanceof Element &&
              gesture.owns(event.target)
            ) {
              event.preventDefault();
            }
          };
          view.dom.addEventListener("pointerdown", onPointerDown, true);
          view.dom.addEventListener("dragstart", onDragStart, true);
          // A finger's moves over a lifted object must not scroll the page:
          // each movable object carries the touch guard, which has to be on
          // it before the finger lands. Only a touch device pays for it -- a
          // touch laptop too, whose primary pointer is its trackpad.
          const touchDevice = devicePointerIsCoarse() || !deviceCanHover() || deviceHasTouch();
          const guarded = new Map<Element, () => void>();
          const guard = (element: Element) => {
            if (element.isConnected && !guarded.has(element)) {
              guarded.set(element, installObjectDragTouchGuard(element));
            }
          };
          const unguard = (element: Element) => {
            if (element.isConnected) return;
            guarded.get(element)?.();
            guarded.delete(element);
          };
          /** `visit` on `node` and every movable object inside it. */
          const eachObject = (node: Node, visit: (element: Element) => void) => {
            if (!(node instanceof Element)) return;
            if (node.matches(MOVABLE_OBJECT_SELECTOR)) visit(node);
            if (node.firstElementChild) node.querySelectorAll(MOVABLE_OBJECT_SELECTOR).forEach(visit);
          };
          // Only what the editor added or removed is looked at: a sweep of the
          // whole document per change walked every stroke of ink on every
          
          const observer = touchDevice
            ? new MutationObserver((records) => {
                for (const record of records) {
                  for (const node of record.removedNodes) eachObject(node, unguard);
                  for (const node of record.addedNodes) eachObject(node, guard);
                }
              })
            : null;
          if (observer) {
            eachObject(view.dom, guard);
            observer.observe(view.dom, { childList: true, subtree: true });
          }
          return {
            destroy() {
              observer?.disconnect();
              for (const cleanup of guarded.values()) cleanup();
              guarded.clear();
              lift?.cancel("aborted");
              lift = null;
              gesture?.finish();
              view.dom.removeEventListener("pointerdown", onPointerDown, true);
              view.dom.removeEventListener("dragstart", onDragStart, true);
            },
          };
        },
      }),
    ];
  },
});

export default ObjectMove;
