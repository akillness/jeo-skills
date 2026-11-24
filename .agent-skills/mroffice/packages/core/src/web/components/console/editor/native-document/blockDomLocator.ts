/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { EditorView } from "@tiptap/pm/view";

/**
 * `view.domAtPos` for positions inside one text block, answered from that
 * block's view without walking its siblings.
 *
 * ProseMirror finds a position's DOM by walking each level's children from
 * the first, summing their sizes: a position inside a paragraph of n runs
 * costs the runs before it, plus every block and sheet before the paragraph.
 * A measure that asks for a few positions per character of such a paragraph
 * (overflowPunctuationHang's character boxes) cost the square of its runs:
 * R461-D71's code listings (~3,500 runs) spent 12 s of a print's layout in
 * domFromPos. A position inside the block's content always descends into the
 * block (every level above meets it inside a child), so the answer is the
 * block's own `domFromPos`; here its first walk is a binary search over the
 * children's ends, read once, and the rest is ProseMirror's own logic at that
 * level (zero-size widgets, the side to look to, the trailing hack), the
 * children's own `domFromPos` below it.
 */
export type BlockDomLocator = (pos: number, side: number) => { node: Node; offset: number };

interface Desc {
  readonly size: number;
  readonly border: number;
  readonly dom: Node;
  readonly domAtom: boolean;
  readonly children: readonly Desc[];
  readonly contentDOM?: Node | null;
  readonly widget?: unknown;
  readonly side?: number;
  readonly node?: unknown;
  domFromPos(pos: number, side: number): { node: Node; offset: number };
}

function domIndex(node: Node): number {
  let index = 0;
  for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) index += 1;
  return index;
}



function locatorOff(view: EditorView): boolean {
  return (view.dom.ownerDocument.defaultView as (Window & { __docsBlockDomLocatorOff?: boolean }) | null)?.__docsBlockDomLocatorOff === true;
}

/**
 * The locator for the text block whose DOM is `element`, at document
 * position `pos` (before the block). Positions outside its content, and every
 * position when the block has no view to read, go to `view.domAtPos`.
 */
export function blockDomLocator(view: EditorView, element: HTMLElement, pos: number, contentSize: number): BlockDomLocator {
  const whole: BlockDomLocator = (at, side) => view.domAtPos(at, side);
  if (locatorOff(view)) return whole;
  const desc = (element as unknown as { pmViewDesc?: Desc }).pmViewDesc;
  const contentDOM = desc?.contentDOM;
  if (!desc || desc.dom !== element || !contentDOM || desc.border !== 1 || !Array.isArray(desc.children)) return whole;
  const children = desc.children;
  const ends: number[] = [];
  let total = 0;
  for (const child of children) {
    total += child.size;
    ends.push(total);
  }
  if (total !== contentSize) return whole;
  const start = pos + 1;
  // ProseMirror's trailing hack (a <br> or <img> after a closing break): the
  // last child, of no size, no widget and no node, a DOM atom.
  const last = children.length > 0 ? children[children.length - 1]! : null;
  const trailingHack = Boolean(last && last.size === 0 && last.widget === undefined && last.node === undefined && last.domAtom === true);
  return (at, side) => {
    const local = at - start;
    if (local < 0 || local > contentSize) return whole(at, side);
    // The first child that ends past the position (ProseMirror's first loop).
    let lo = 0, hi = children.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ends[mid]! > local) hi = mid;
      else lo = mid + 1;
    }
    let i = lo;
    let offset = 0;
    if (i < children.length) offset = local - (i > 0 ? ends[i - 1]! : 0);
    else if (trailingHack) {
      i = children.length - 1;
      offset = local - (i > 0 ? ends[i - 1]! : 0);
    }
    if (offset) return children[i]!.domFromPos(offset - children[i]!.border, side);
    // Back over zero-length widgets with side >= 0 before this point.
    for (let prev: Desc; i && !(prev = children[i - 1]!).size && prev.widget !== undefined && (prev.side ?? 0) >= 0; i -= 1) { /* back */ }
    if (side <= 0) {
      let prev: Desc | null = null, enter = true;
      for (;; i -= 1, enter = false) {
        prev = i ? children[i - 1]! : null;
        if (!prev || prev.dom.parentNode === contentDOM) break;
      }
      if (prev && side && enter && !prev.border && !prev.domAtom) return prev.domFromPos(prev.size, side);
      return { node: contentDOM, offset: prev ? domIndex(prev.dom) + 1 : 0 };
    }
    let next: Desc | null = null, enter = true;
    for (;; i += 1, enter = false) {
      next = i < children.length ? children[i]! : null;
      if (!next || next.dom.parentNode === contentDOM) break;
    }
    if (next && enter && !next.border && !next.domAtom) return next.domFromPos(0, side);
    return { node: contentDOM, offset: next ? domIndex(next.dom) : contentDOM.childNodes.length };
  };
}
