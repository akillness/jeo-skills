/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's linked text boxes (Create Link): one story flows through a chain
 * of boxes, and what the first box cannot hold continues in the next
 * (MS-OI29500 §14.9.1.1, `w:txbx` with `w:linkedTxbx` / `w:id` + `w:seq`).
 *
 * The first box holds the story as its own content (`documentShapeStory.ts`)
 * and clips what does not fit. A later box draws the continuation: the
 * story's laid-out words from the first line the box before it could not
 * show, laid out again at its own width. Each box is measured as drawn, so
 * the cut always falls at a line the reader actually saw cut. The later
 * boxes take no typing (Word's caret flows through them; here the words are
 * edited in the first box), and what they draw is not document content.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { DOCUMENT_SHAPE_STORY_ATTRIBUTE } from "./documentShapeStory";

/** On a shape's drawn label (the element a later chain box draws into). */
export const DOCUMENT_SHAPE_LABEL_ATTRIBUTE = "data-document-shape-label";
/** On the continuation a later chain box draws. */
export const DOCUMENT_SHAPE_LINKED_FLOW_ATTRIBUTE = "data-document-shape-linked-flow";

type ChainBox = { pos: number; sequence: number };

/** The continuation each later box drew last, so a re-render can put it back. */
const drawnFlows = new WeakMap<HTMLElement, HTMLElement>();

/** The continuation this box drew, for its node view's render to keep. */
export function documentShapeLinkedFlowFor(root: HTMLElement): HTMLElement | null {
  return drawnFlows.get(root) ?? null;
}

function linkedChains(doc: ProseMirrorNode): Map<number, ChainBox[]> {
  const chains = new Map<number, ChainBox[]>();
  doc.descendants((node, pos) => {
    if (node.type.name !== "documentShape") return !node.isTextblock;
    const story = node.attrs.linkedTextBoxStoryId;
    const sequence = node.attrs.linkedTextBoxSequence;
    if (typeof story === "number" && typeof sequence === "number") {
      const chain = chains.get(story) ?? [];
      chain.push({ pos, sequence });
      chains.set(story, chain);
    }
    // A shape's story holds no further shapes.
    return false;
  });
  for (const chain of chains.values()) chain.sort((a, b) => a.sequence - b.sequence);
  return chains;
}

function textNodesOf(root: Node): Text[] {
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  return nodes;
}

/**
 * The start of the first line of `container` that does not fit above
 * `clipBottom` (client px), or null when every line fits.
 */
export function linkedFlowCut(
  container: HTMLElement,
  clipBottom: number,
): { node: Text; offset: number; top: number } | null {
  const range = container.ownerDocument.createRange();
  let lineTop = Number.NEGATIVE_INFINITY;
  let lineStart: { node: Text; offset: number; top: number } | null = null;
  for (const node of textNodesOf(container)) {
    const length = node.data.length;
    for (let offset = 0; offset < length; offset += 1) {
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getClientRects()[0];
      if (!rect || (rect.width === 0 && rect.height === 0)) continue;
      // A new line starts where a character sits below the line before.
      if (rect.top >= lineTop + Math.max(1, rect.height / 2) || lineStart === null) {
        lineTop = rect.top;
        lineStart = { node, offset, top: rect.top };
      }
      if (rect.bottom > clipBottom + 0.5) return lineStart;
    }
  }
  return null;
}

/** The path of child indexes from `root` down to `node`. */
function pathTo(root: Node, node: Node): number[] | null {
  const path: number[] = [];
  for (let current: Node | null = node; current && current !== root; current = current.parentNode) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
  }
  return path;
}

function nodeAtPath(root: Node, path: readonly number[]): Node | null {
  let current: Node | null = root;
  for (const index of path) current = current?.childNodes[index] ?? null;
  return current;
}

/**
 * A copy of `container`'s words from `cut` on: the lines before it are gone,
 * and the copy carries nothing that names document content (block ids,
 * anchors, the story marker) or takes editing.
 */
export function linkedFlowContinuation(
  container: HTMLElement,
  cut: { node: Text; offset: number },
): HTMLElement | null {
  const path = pathTo(container, cut.node);
  if (!path) return null;
  const copy = container.cloneNode(true) as HTMLElement;
  const copiedCut = nodeAtPath(copy, path);
  if (!(copiedCut instanceof Text)) return null;
  const range = copy.ownerDocument.createRange();
  range.setStart(copy, 0);
  range.setEnd(copiedCut, cut.offset);
  range.deleteContents();
  const strip = (element: Element) => {
    for (const name of [...element.getAttributeNames()]) {
      if (
        name === "id" ||
        name === "contenteditable" ||
        name === DOCUMENT_SHAPE_STORY_ATTRIBUTE ||
        name === "data-block-id" ||
        name.includes("anchor")
      ) {
        element.removeAttribute(name);
      }
    }
  };
  strip(copy);
  for (const element of copy.querySelectorAll("*")) strip(element);
  copy.contentEditable = "false";
  copy.setAttribute(DOCUMENT_SHAPE_LINKED_FLOW_ATTRIBUTE, "true");
  copy.setAttribute("aria-hidden", "true");
  return copy;
}

function boxParts(view: EditorView, pos: number) {
  const root = view.nodeDOM(pos);
  if (!(root instanceof HTMLElement)) return null;
  const story = root.querySelector<HTMLElement>(`[${DOCUMENT_SHAPE_STORY_ATTRIBUTE}]`);
  const label = root.querySelector<HTMLElement>(`[${DOCUMENT_SHAPE_LABEL_ATTRIBUTE}]`);
  return { root, story, label, text: (story ?? label)?.parentElement ?? null };
}

/** The boxes whose words this module clips at their cut line, per view. */
const clippedBoxes = new WeakMap<EditorView, Set<HTMLElement>>();

/**
 * Word moves a line that does not fit whole into the next box: the box
 * before it shows only the lines above (it drew the cut line half).
 */
function clipAtCut(clipped: Set<HTMLElement>, text: HTMLElement, cutTop: number | null): void {
  if (cutTop === null) {
    if (clipped.delete(text)) text.style.clipPath = "";
    return;
  }
  const rect = text.getBoundingClientRect();
  const scale = text.offsetHeight > 0 ? rect.height / text.offsetHeight : 1;
  const hidden = Math.max(0, (rect.bottom - cutTop) / (scale || 1));
  text.style.clipPath = `inset(0 0 ${hidden.toFixed(2)}px 0)`;
  clipped.add(text);
}

const FONT_PROPERTIES = ["font-family", "font-size", "font-weight", "font-style", "line-height", "color", "text-align"] as const;

function setDrawn(root: HTMLElement, label: HTMLElement, flow: HTMLElement | null): void {
  if (flow) {
    drawnFlows.set(root, flow);
    if (label.firstChild !== flow || label.childNodes.length !== 1) label.replaceChildren(flow);
  } else if (drawnFlows.has(root)) {
    drawnFlows.delete(root);
    label.replaceChildren();
  }
}

/** Lays every linked chain's continuation into its later boxes. */
export function layoutLinkedTextBoxFlows(view: EditorView): void {
  const before = clippedBoxes.get(view) ?? new Set<HTMLElement>();
  const clipped = new Set<HTMLElement>();
  for (const chain of linkedChains(view.state.doc).values()) {
    const [first, ...rest] = chain;
    if (!first || first.sequence !== 0 || rest.length === 0) continue;
    const source = boxParts(view, first.pos);
    if (!source?.story || !source.text || source.story.childNodes.length === 0) continue;
    const font = getComputedStyle(source.text);
    let container: HTMLElement | null = source.story;
    let clip: HTMLElement = source.text;
    for (const box of rest) {
      const target = boxParts(view, box.pos);
      if (!target?.label || !target.text || target.story?.childNodes.length) {
        container = null;
        continue;
      }
      const cut: ReturnType<typeof linkedFlowCut> = container ? linkedFlowCut(container, clip.getBoundingClientRect().bottom) : null;
      clipAtCut(clipped, clip, cut ? cut.top : null);
      const flow: HTMLElement | null = container && cut ? linkedFlowContinuation(container, cut) : null;
      if (flow) {
        for (const property of FONT_PROPERTIES) flow.style.setProperty(property, font.getPropertyValue(property));
        flow.style.display = "block";
        flow.style.width = `${target.text.clientWidth}px`;
        flow.style.whiteSpace = "pre-wrap";
      }
      setDrawn(target.root, target.label, flow);
      container = flow;
      clip = target.text;
    }
  }
  // A box no longer cut (its link removed) shows all its words again.
  for (const text of before) if (!clipped.has(text)) text.style.clipPath = "";
  clippedBoxes.set(view, clipped);
}

/** Whether a linked text box sits in `doc` between `from` and `to`. */
function holdsLinkedBox(doc: ProseMirrorNode, from: number, to: number): boolean {
  let found = false;
  doc.nodesBetween(from, to, (node) => {
    if (found) return false;
    if (node.type.name === "documentShape") {
      if (typeof node.attrs.linkedTextBoxStoryId === "number") found = true;
      return false;
    }
    return !node.isTextblock;
  });
  return found;
}

/**
 * Whether the document has held a linked text box: read whole once, then
 * only where an edit wrote (a typed letter does not walk the book).
 */
const linkedFlowKey = new PluginKey<boolean>("documentShapeLinkedFlow");

/** Re-lays the continuations after each change, once a frame. */
export function documentShapeLinkedFlowPlugin(): Plugin<boolean> {
  return new Plugin<boolean>({
    key: linkedFlowKey,
    state: {
      init: (_config, state) => holdsLinkedBox(state.doc, 0, state.doc.content.size),
      apply(tr, chained) {
        if (chained || !tr.docChanged) return chained;
        // Each step's written range, carried to the final document.
        const { maps } = tr.mapping;
        for (let index = 0; index < maps.length; index += 1) {
          const after = tr.mapping.slice(index + 1);
          let found = false;
          maps[index].forEach((_oldStart, _oldEnd, newStart, newEnd) => {
            const from = Math.max(0, after.map(newStart, -1));
            const to = Math.min(tr.doc.content.size, after.map(newEnd, 1));
            found ||= holdsLinkedBox(tr.doc, from, to);
          });
          if (found) return true;
        }
        return false;
      },
    },
    view(view) {
      let frame = 0;
      const schedule = () => {
        if (frame || typeof requestAnimationFrame !== "function") return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!view.isDestroyed) layoutLinkedTextBoxFlows(view);
        });
      };
      if (linkedFlowKey.getState(view.state)) schedule();
      return {
        update(next) {
          if (linkedFlowKey.getState(next.state)) schedule();
        },
        destroy() {
          if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
        },
      };
    },
  });
}
