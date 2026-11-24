"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Live transforms on a Docs page: a picture, a shape, a chart or strokes of
 * ink that another member is moving, sizing or turning, drawn on this desk
 * while the hand is still on it (lib/collab/live-transform carries it on the
 * page room's presence).
 *
 * The document's commit on release is unchanged and stays the truth: the
 * live frame is a visual overlay a node view draws on its own DOM (no
 * transaction, nothing persisted); the text around the object reflows when
 * the commit lands, as it does now.
 *
 * ## Frames
 *
 * Surface `docs:<pageId>`. An object is named by its position in the page's
 * document and a fingerprint of the node there (`<pos>.<hash>`), so a desk
 * whose document is not yet the mover's draws nothing on the wrong node.
 * A frame is in document CSS px (the page's own, zoom-free): `x`/`y` how far
 * the object is from where it rests at the gesture's start, `w`/`h` the box
 * the node view sizes (the picture's raster, the shape's canvas), `r` its turn.
 *
 * ## Use
 *
 * - {@link useDocumentLiveTransforms} once per page editor (NoteEditor):
 *   publishes from a member who can edit, receives everyone else's.
 * - A node view registers a {@link DocumentLiveTarget} on its DOM
 *   ({@link registerDocumentLiveTarget}) and calls
 *   {@link reapplyDocumentLiveFrame} after it re-renders.
 * - A gesture calls {@link beginDocumentLiveGesture}, `move`/`offset` from its
 *   preview path, `end()` after its commit (or cancel).
 *
 * The overlay goes back to the document as soon as the object's node changes
 * on this desk (the commit landed), when the stream ends where the document
 * already is, or after the shared store's grace.
 */

import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import type { Awareness } from "y-protocols/awareness";

import {
  createLiveTransformPublisher,
  createLiveTransformTracker,
  liveTransformKey,
  liveTransforms,
  subscribeLiveTransformSurface,
  type LiveTransformFrame,
  type LiveTransformObject,
  type LiveTransformPublisher,
} from "../../../../lib/collab/live-transform";

/** Marks a registered element below a node view's DOM (a React node view). */
export const DOCUMENT_LIVE_TARGET_ATTR = "data-document-live-target";

export interface DocumentLiveRest {
  readonly w: number;
  readonly h: number;
  readonly r: number;
}

/** What a node view draws for another member's gesture. */
export interface DocumentLiveTarget {
  /** The box the node view sizes, at rest (document px), and its turn. */
  rest(): DocumentLiveRest | null;
  /** Draw `frame` over the document's own state; null puts it back. */
  show(frame: LiveTransformFrame | null): void;
}

const targets = new WeakMap<Element, DocumentLiveTarget>();
const shownFrames = new WeakMap<Element, LiveTransformFrame>();

export function registerDocumentLiveTarget(element: HTMLElement, target: DocumentLiveTarget): () => void {
  targets.set(element, target);
  element.setAttribute(DOCUMENT_LIVE_TARGET_ATTR, "true");
  return () => {
    if (targets.get(element) !== target) return;
    targets.delete(element);
    shownFrames.delete(element);
    element.removeAttribute(DOCUMENT_LIVE_TARGET_ATTR);
  };
}

/** A node view re-rendered from its node: the live frame it shows goes on again. */
export function reapplyDocumentLiveFrame(element: Element): void {
  const frame = shownFrames.get(element);
  const target = targets.get(element);
  if (frame && target) target.show(frame);
}

/** A target that only moves (a floating chart): `translate`, nothing else. */
export function documentLiveTranslateTarget(element: HTMLElement): DocumentLiveTarget {
  let shown = false;
  return {
    rest: () => ({ w: element.offsetWidth, h: element.offsetHeight, r: 0 }),
    show(frame) {
      if (!frame) {
        if (shown) element.style.translate = "";
        shown = false;
        return;
      }
      shown = true;
      element.style.translate = frame.x || frame.y ? `${frame.x}px ${frame.y}px` : "";
    },
  };
}

export function documentLiveSurface(pageId: string | null | undefined): string | null {
  return pageId ? `docs:${pageId}` : null;
}

function hash(text: string): string {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) {
    value = ((value << 5) + value + text.charCodeAt(index)) | 0;
  }
  return (value >>> 0).toString(36);
}

/** The object's name on the wire: its position and what stands there. */
export function documentLiveObjectId(node: ProseMirrorNode, pos: number): string {
  const attrs = node.attrs as Record<string, unknown>;
  const src = typeof attrs.src === "string" ? attrs.src : "";
  const fingerprint = [
    node.type.name,
    attrs.block_id,
    attrs.xEmu,
    attrs.yEmu,
    attrs.widthEmu,
    attrs.heightEmu,
    attrs.width,
    attrs.height,
    attrs.rotation,
    attrs.pictureRotation,
    src.length,
    src.slice(-32),
  ].join("|");
  return `${pos}.${hash(fingerprint)}`;
}

function positionOf(id: string): number | null {
  const dot = id.indexOf(".");
  const pos = Number(dot > 0 ? id.slice(0, dot) : Number.NaN);
  return Number.isInteger(pos) && pos >= 0 ? pos : null;
}

function nodeAt(view: EditorView, pos: number): ProseMirrorNode | null {
  try {
    return pos <= view.state.doc.content.size ? view.state.doc.nodeAt(pos) : null;
  } catch {
    return null;
  }
}

function targetElementOf(dom: Node | null): HTMLElement | null {
  if (!(dom instanceof HTMLElement)) return null;
  if (targets.has(dom)) return dom;
  const inner = dom.querySelector(`[${DOCUMENT_LIVE_TARGET_ATTR}]`);
  return inner instanceof HTMLElement && targets.has(inner) ? inner : null;
}

function targetAt(view: EditorView, pos: number): { element: HTMLElement; target: DocumentLiveTarget } | null {
  let dom: Node | null = null;
  try {
    dom = view.nodeDOM(pos);
  } catch {
    return null;
  }
  const element = targetElementOf(dom);
  const target = element ? targets.get(element) : undefined;
  return element && target ? { element, target } : null;
}

// ---------------------------------------------------------------------------
// One page editor's live transforms.

interface Drawn {
  readonly element: HTMLElement;
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

interface DocumentLiveController {
  readonly surface: string;
  readonly publisher: LiveTransformPublisher | null;
  docChanged(): void;
  dispose(): void;
}

const controllers = new WeakMap<EditorView, DocumentLiveController>();

function attachDocumentLiveTransforms(
  view: EditorView,
  surface: string,
  receive: Awareness | null,
  send: Awareness | null,
): DocumentLiveController {
  const publisher = send ? createLiveTransformPublisher(send) : null;
  const disposeTracker = receive ? createLiveTransformTracker(receive) : () => undefined;
  const drawn = new Map<string, Drawn>();

  const hide = (id: string, entry: Drawn) => {
    drawn.delete(id);
    shownFrames.delete(entry.element);
    targets.get(entry.element)?.show(null);
  };

  const draw = (id: string) => {
    const key = liveTransformKey(surface, id);
    const frame = liveTransforms.read(key);
    const previous = drawn.get(id);
    if (!frame) {
      if (previous) hide(id, previous);
      return;
    }
    const pos = positionOf(id);
    const node = pos === null ? null : nodeAt(view, pos);
    const found = pos !== null && node && documentLiveObjectId(node, pos) === id ? targetAt(view, pos) : null;
    if (!found || pos === null || !node) {
      // Not the mover's node here (this desk's document is elsewhere): nothing.
      if (previous) hide(id, previous);
      return;
    }
    if (previous && previous.element !== found.element) hide(id, previous);
    if (!drawn.has(id)) {
      const rest = found.target.rest();
      if (rest) liveTransforms.noteCommitted(key, { x: 0, y: 0, w: rest.w, h: rest.h, r: rest.r });
    }
    drawn.set(id, { element: found.element, node, pos });
    shownFrames.set(found.element, frame);
    found.target.show(frame);
  };

  const unsubscribe = subscribeLiveTransformSurface(surface, draw);

  const controller: DocumentLiveController = {
    surface,
    publisher,
    docChanged() {
      // The object's node changed (the mover's commit landed, or it went):
      // the document draws it again, and the rest of that stream is dropped.
      for (const [id, entry] of [...drawn]) {
        if (nodeAt(view, entry.pos) === entry.node) continue;
        hide(id, entry);
        liveTransforms.drop(liveTransformKey(surface, id));
      }
    },
    dispose() {
      unsubscribe();
      disposeTracker();
      publisher?.dispose();
      for (const [id, entry] of [...drawn]) hide(id, entry);
      if (controllers.get(view) === controller) controllers.delete(view);
    },
  };
  controllers.set(view, controller);
  return controller;
}

/**
 * The page editor's live transforms for its lifetime: `send` is the room's
 * presence when this member can edit (null: receive only), `receive` the
 * presence the others' streams arrive on.
 */
export function useDocumentLiveTransforms(
  editor: Editor | null,
  surface: string | null,
  receive: Awareness | null,
  send: Awareness | null,
): void {
  useEffect(() => {
    if (!editor || editor.isDestroyed || !surface || (!receive && !send)) return;
    const controller = attachDocumentLiveTransforms(editor.view, surface, receive, send);
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) controller.docChanged();
    };
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
      controller.dispose();
    };
  }, [editor, surface, receive, send]);
}

// ---------------------------------------------------------------------------
// Sending: this member's hand on objects.

export interface DocumentLiveFrameAt {
  readonly pos: number;
  readonly x?: number;
  readonly y?: number;
  readonly w?: number;
  readonly h?: number;
  readonly r?: number;
}

export interface DocumentLiveGesture {
  /** The objects at these frames (unset fields: where they rest). */
  move(frames: readonly DocumentLiveFrameAt[]): void;
  /** Every object of the gesture `dx`/`dy` from where it rests. */
  offset(dx: number, dy: number): void;
  /**
   * The gesture is over: after its commit (the others hold the last frame
   * until it lands) or a cancel (they go back to the rest frames).
   */
  end(): void;
}

const noGesture: DocumentLiveGesture = {
  move: () => undefined,
  offset: () => undefined,
  end: () => undefined,
};

/**
 * A gesture on the nodes at `positions` (the one under the hand first). A
 * no-op when the page has no room or this member cannot edit.
 */
export function beginDocumentLiveGesture(
  view: EditorView | null | undefined,
  positions: readonly number[],
): DocumentLiveGesture {
  const controller = view ? controllers.get(view) : undefined;
  const publisher = controller?.publisher;
  if (!view || !controller || !publisher) return noGesture;
  const startDoc = view.state.doc;
  const objects = new Map<number, { id: string; rest: DocumentLiveRest }>();
  for (const pos of positions) {
    const node = nodeAt(view, pos);
    if (!node || objects.has(pos)) continue;
    const rest = targetAt(view, pos)?.target.rest() ?? null;
    if (!rest) continue;
    objects.set(pos, { id: documentLiveObjectId(node, pos), rest });
  }
  if (objects.size === 0) return noGesture;
  const surface = controller.surface;
  let moved = false;
  const restFrames = (): LiveTransformObject[] =>
    [...objects.values()].map(({ id, rest }) => ({ id, x: 0, y: 0, w: rest.w, h: rest.h, r: rest.r }));
  const gesture: DocumentLiveGesture = {
    move(frames) {
      const out: LiveTransformObject[] = [];
      for (const frame of frames) {
        const object = objects.get(frame.pos);
        if (!object) continue;
        out.push({
          id: object.id,
          x: frame.x ?? 0,
          y: frame.y ?? 0,
          w: frame.w ?? object.rest.w,
          h: frame.h ?? object.rest.h,
          r: frame.r ?? object.rest.r,
        });
      }
      if (out.length === 0) return;
      moved = true;
      publisher.publish(surface, out);
    },
    offset(dx, dy) {
      gesture.move([...objects.keys()].map((pos) => ({ pos, x: dx, y: dy })));
    },
    end() {
      if (!moved) return;
      moved = false;
      // The document took the gesture: the others hold the last frame until
      // the commit reaches them. Nothing changed: back to where they rest.
      publisher.end(surface, view.state.doc !== startDoc ? null : restFrames());
    },
  };
  return gesture;
}
