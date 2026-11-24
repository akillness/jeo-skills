/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Keeps the reader's view still while the document above it changes, in an
 * engine without CSS scroll anchoring (WebKit), without a layout per
 * transaction.
 *
 * ProseMirror keeps the viewport still by itself only where it finds no
 * `overflow-anchor` on the editor's style: it reads the position of an
 * element near the top of the view before every transaction that redraws,
 * and puts the scroll back after it. Each of those reads lays out the whole
 * page as it stands mid-update. Chromium has the property (and anchors the
 * scroll natively), so ProseMirror skips it there; WebKit has not, and on a
 * 693k-character book those reads cost 2.8 s of forced layout while it
 * opened, 990 ms the worst, one per pagination pass.
 *
 * Here ProseMirror is told the view is anchored, and the anchor is kept
 * after layout instead: a ResizeObserver delivery comes after the frame's
 * layout and before its paint, so the reads below lay nothing out and the
 * correction is never painted late. A transaction, a scroll or a resize asks
 * for one delivery (by observing the editor anew); the editor's own size
 * changes deliver by themselves. The anchor is the block holding the caret
 * when it is in view, else the block at the top of the view, as ProseMirror
 * picks; it is kept as a document position, so a block drawn again is found
 * again.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

interface Anchor {
  /** The position before the anchor block. */
  pos: number;
  /** The anchor block's top below the scroller's visible top when it was
   * taken. Measured against the scroller, not the viewport: the window the
   * editor is in moves on the screen (a pan of the desk, a dragged window),
   * and that is no change of the document to correct. */
  top: number;
  scroller: HTMLElement;
  /** The scroller's scrollTop then. */
  scrollTop: number;
}

const scrollAnchorKey = new PluginKey("documentScrollAnchor");

/** documentInk's `DOCUMENT_INK_LANDING_META`: the transaction that lands ink. */
const DOCUMENT_INK_LANDING_META = "documentInkLanding";

/** Whether the engine keeps a scroll container's view still by itself. */
export function nativeScrollAnchoring(win: Window): boolean {
  try {
    return (win as Window & { CSS?: typeof CSS }).CSS?.supports?.("overflow-anchor", "auto") === true;
  } catch {
    return false;
  }
}

function scrollerOf(view: EditorView): HTMLElement | null {
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;
  if (!win) return null;
  for (let element = view.dom.parentElement; element; element = element.parentElement) {
    const overflow = win.getComputedStyle(element).overflowY;
    if ((overflow === "auto" || overflow === "scroll" || overflow === "overlay") && element.scrollHeight > element.clientHeight) {
      return element;
    }
  }
  // The page itself is never held: an editor without a scroll box of its own
  // (the homepage's showcase windows) moves with the page's own scrolling and
  // animations, and holding a block still there pulled the page back from
  // under the reader in Safari.
  return null;
}

/** The innermost drawn block around `pos`: the position before it, and its DOM. */
function blockAround(view: EditorView, pos: number): { pos: number; dom: HTMLElement } | null {
  const { doc } = view.state;
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const before = $pos.before(depth);
    const dom = view.nodeDOM(before);
    if (dom instanceof HTMLElement && dom.isConnected) return { pos: before, dom };
  }
  return null;
}

/** The DOM of the block that starts at `pos`. */
function blockAt(view: EditorView, pos: number): HTMLElement | null {
  if (pos < 0 || pos >= view.state.doc.content.size) return null;
  const dom = view.nodeDOM(pos);
  return dom instanceof HTMLElement && dom.isConnected ? dom : null;
}

/** The part of the viewport the scroller shows, in viewport coordinates. */
function visibleBand(scroller: HTMLElement): { top: number; bottom: number } {
  const doc = scroller.ownerDocument;
  if (scroller === doc.scrollingElement) return { top: 0, bottom: doc.defaultView?.innerHeight ?? 0 };
  const rect = scroller.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom };
}

/** Pixels of the scroller's scrollTop per viewport pixel (a scaled window). */
function scrollScale(scroller: HTMLElement): number {
  if (scroller === scroller.ownerDocument.scrollingElement) return 1;
  const height = scroller.getBoundingClientRect().height;
  return height > 0 && scroller.offsetHeight > 0 ? scroller.offsetHeight / height : 1;
}

function takeAnchor(view: EditorView): Anchor | null {
  const scroller = scrollerOf(view);
  if (!scroller) return null;
  const band = visibleBand(scroller);
  const editor = view.dom.getBoundingClientRect();
  const top = Math.max(band.top, editor.top);
  const bottom = Math.min(band.bottom, editor.bottom);
  if (!(bottom > top)) return null;
  const take = (pos: number): Anchor | null => {
    const block = blockAround(view, pos);
    if (!block) return null;
    const rect = block.dom.getBoundingClientRect();
    if (rect.bottom <= top || rect.top >= bottom) return null;
    return { pos: block.pos, top: rect.top - band.top, scroller, scrollTop: scroller.scrollTop };
  };
  // The caret's block, when the caret is in view: the line being written
  // on stays where it is.
  const caret = take(view.state.selection.head);
  if (caret) return caret;
  // Else the first block at the top of the view.
  const x = (Math.max(editor.left, 0) + Math.min(editor.right, view.dom.ownerDocument.defaultView?.innerWidth ?? editor.right)) / 2;
  const root = view.root as Document | ShadowRoot;
  for (let y = top + 1; y < Math.min(bottom, top + 200); y += 5) {
    const element = root.elementFromPoint?.(x, y);
    if (!element || element === view.dom || !view.dom.contains(element)) continue;
    let pos: number;
    try {
      pos = view.posAtDOM(element, 0);
    } catch {
      continue;
    }
    const anchor = take(pos);
    if (anchor) return anchor;
  }
  return null;
}

export const DocumentScrollAnchor = Extension.create({
  name: "documentScrollAnchor",
  addProseMirrorPlugins() {
    let anchor: Anchor | null = null;
    // Deliveries left that only take the anchor again: after ink lands.
    let holdDeliveries = 0;
    return [
      new Plugin({
        key: scrollAnchorKey,
        state: {
          init: () => null,
          apply(tr) {
            // The anchor follows its block through edits (a block inserted
            // right before it, or split off after it, is not the anchor).
            if (anchor && tr.docChanged) {
              // A block taken out (an object moved to another paragraph is
              // taken out and put in elsewhere) is no anchor: held by the
              // block that took its place, the view scrolled by the move.
              const mapped = tr.mapping.mapResult(anchor.pos, 1);
              anchor = mapped.deletedAfter ? null : { ...anchor, pos: mapped.pos };
            }
            // Ink landing moves no line of the text: strokes are drawn over
            // the pages, out of the flow. Whatever the anchor reads across
            // the landing is the strokes and the pages being laid out, and
            // corrected as drift it scrolled the view (182 px on the first
            
            // scroll; the anchor is taken again after them.
            if (tr.getMeta(DOCUMENT_INK_LANDING_META) === true) holdDeliveries = 2;
            return null;
          },
        },
        view(view) {
          const win = view.dom.ownerDocument.defaultView;
          if (!win || nativeScrollAnchoring(win) || typeof win.ResizeObserver !== "function") return {};
          // ProseMirror skips its own per-transaction anchoring when the
          // editor's style names an overflow-anchor value.
          try {
            Object.defineProperty(view.dom.style, "overflowAnchor", {
              configurable: true,
              get: () => "auto",
              set: () => {},
            });
          } catch {
            return {};
          }
          let delivering = false;
          const settle = () => {
            if (!view.dom.isConnected) return;
            delivering = true;
            try {
              if (holdDeliveries > 0) {
                holdDeliveries -= 1;
              } else if (anchor && anchor.scroller.isConnected) {
                const block = blockAt(view, anchor.pos);
                if (block) {
                  const scrolled = (anchor.scroller.scrollTop - anchor.scrollTop) / scrollScale(anchor.scroller);
                  // Against the scroller's own top: a pan of the desk moved
                  // the whole window on the screen, and corrected as drift
                  // it scrolled the document the other way to stay put on
                  // the screen (Safari, where this anchor runs).
                  const top = block.getBoundingClientRect().top - visibleBand(anchor.scroller).top;
                  const drift = top - (anchor.top - scrolled);
                  if (Math.abs(drift) >= 0.5) anchor.scroller.scrollTop += drift * scrollScale(anchor.scroller);
                }
              }
              anchor = takeAnchor(view);
            } finally {
              delivering = false;
            }
          };
          const observer = new win.ResizeObserver(settle);
          observer.observe(view.dom);
          // One delivery after this frame's layout.
          const ask = () => {
            if (delivering) return;
            observer.unobserve(view.dom);
            observer.observe(view.dom);
          };
          // A scroll of the editor's own container (not of another window).
          const onScroll = (event: Event) => {
            const target = event.target;
            if (target === view.dom.ownerDocument || (target instanceof Node && target.contains(view.dom))) ask();
          };
          win.addEventListener("scroll", onScroll, { capture: true, passive: true });
          win.addEventListener("resize", ask);
          return {
            update(updated, previous) {
              if (updated.state.doc !== previous.doc || !updated.state.selection.eq(previous.selection)) ask();
            },
            destroy() {
              observer.disconnect();
              win.removeEventListener("scroll", onScroll, { capture: true });
              win.removeEventListener("resize", ask);
              delete (view.dom.style as unknown as Record<string, unknown>).overflowAnchor;
              anchor = null;
            },
          };
        },
      }),
    ];
  },
});
