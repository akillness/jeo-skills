/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Scrolling the selection into view keeps it below the sticky ribbon.
 *
 * The document scrollport reserves the ribbon's height as its
 * `scroll-padding-top` (scrollportToolbarInset), which the browser honours
 * when it scrolls. ProseMirror scrolls a selection into view by its own
 * arithmetic (`scrollMargin` / `scrollThreshold`, 5px and 0 by default) and
 * never reads that padding, so going UP to a heading, a page or a note put
 * the target at the scrollport's top edge, behind the ribbon that sticks
 * there, with the caret on it (WUA 052). Going down was fine: the target
 * lands at the bottom edge. The same reserve now goes to ProseMirror, read
 * from the scrollport each time it scrolls (the ribbon wraps and collapses,
 * and the reserve is 0 while focus is in the ribbon).
 *
 * Task panes float over the window's edges (officeTaskPaneOverlay.ts): what
 * they cover at the left and right is published on the scrollport, and the
 * caret keeps clear of it the same way, so typing never runs under a pane.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { readOfficeTaskPaneCover } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneOverlay.ts";

const DEFAULT_SCROLL_MARGIN = 5;

export const scrollportToolbarMarginKey = new PluginKey("scrollportToolbarMargin");

interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The top reserve the editor's scrollport keeps for its sticky ribbon (px). */
export function scrollportTopReserve(view: EditorView | null): number {
  const dom = view?.dom as HTMLElement | undefined;
  const scrollport = dom?.closest<HTMLElement>(".note-window-scroll");
  const win = scrollport?.ownerDocument.defaultView;
  if (!scrollport || !win) return 0;
  const reserve = Number.parseFloat(win.getComputedStyle(scrollport).scrollPaddingTop);
  return Number.isFinite(reserve) && reserve > 0 ? reserve : 0;
}

/** What the task panes floating over the window cover of its scrollport. */
function scrollportSideReserve(view: EditorView | null): { left: number; right: number } {
  const dom = view?.dom as HTMLElement | undefined;
  return readOfficeTaskPaneCover(dom?.closest<HTMLElement>(".note-window-scroll"));
}

/** The nearest ancestor of the editor that scrolls sideways now (the
 * document body while it keeps room for the cards). */
function sidewaysScroller(view: EditorView): HTMLElement | null {
  const win = view.dom.ownerDocument.defaultView;
  for (
    let node = (view.dom as HTMLElement).parentElement;
    node && win;
    node = node.parentElement
  ) {
    if (node.classList.contains("note-window-scroll")) return null;
    if (node.scrollWidth <= node.clientWidth + 1) continue;
    const overflow = win.getComputedStyle(node).overflowX;
    if (overflow === "auto" || overflow === "scroll") return node;
  }
  return null;
}

/**
 * The browser moves the caret itself for the arrows, Home and End, and
 * reveals it by its own rules, which leave it under a card floating over the
 * window's edge. After such a move the caret is brought clear of the cards
 * along the one axis they cover.
 */
function keepCaretClearOfCards(view: EditorView): void {
  if (view.isDestroyed || !view.hasFocus()) return;
  const reserve = scrollportSideReserve(view);
  if (!reserve.left && !reserve.right) return;
  const scrollport = (view.dom as HTMLElement).closest<HTMLElement>(".note-window-scroll");
  const scroller = sidewaysScroller(view);
  if (!scrollport || !scroller) return;
  // Where the browser drew the caret: at a soft line break the end of one
  // line and the start of the next are one position, and End puts the
  // caret at the end, which the document position alone does not say.
  let caret: { left: number; right: number } | null = null;
  const selection = view.dom.ownerDocument.getSelection();
  if (selection && selection.rangeCount > 0 && view.dom.contains(selection.focusNode)) {
    const range = selection.getRangeAt(0).cloneRange();
    range.setStart(selection.focusNode as Node, selection.focusOffset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect.height > 0) caret = { left: rect.left, right: rect.right };
  }
  if (!caret) {
    try {
      caret = view.coordsAtPos(view.state.selection.head);
    } catch {
      return;
    }
  }
  const port = scrollport.getBoundingClientRect();
  const scale = scrollport.offsetWidth > 0 ? port.width / scrollport.offsetWidth : 1;
  const start = port.left + (reserve.left + DEFAULT_SCROLL_MARGIN) * scale;
  const end = port.right - (reserve.right + DEFAULT_SCROLL_MARGIN) * scale;
  if (caret.right > end) scroller.scrollLeft += (caret.right - end) / scale;
  else if (caret.left < start) scroller.scrollLeft -= (start - caret.left) / scale;
}

export const ScrollportToolbarMargin = Extension.create({
  name: "scrollportToolbarMargin",

  addProseMirrorPlugins() {
    let current: EditorView | null = null;
    const sides = (top: number, rest: number): Sides => {
      const reserve = scrollportSideReserve(current);
      return { top, right: rest + reserve.right, bottom: rest, left: rest + reserve.left };
    };
    const plugin = new Plugin({
      key: scrollportToolbarMarginKey,
      view(editorView) {
        current = editorView;
        let frame = 0;
        return {
          update(view, previous) {
            if (previous.selection.eq(view.state.selection)) return;
            if (typeof window === "undefined" || frame) return;
            // After the browser has revealed the caret its own way.
            frame = window.requestAnimationFrame(() => {
              frame = 0;
              keepCaretClearOfCards(view);
            });
          },
          destroy() {
            if (frame) window.cancelAnimationFrame(frame);
            if (current === editorView) current = null;
          },
        };
      },
    });
    // Read when ProseMirror scrolls, so they follow the ribbon as it is now.
    // A Plugin copies the values of its spec's props once, when it is made,
    // so the two are defined on the plugin's own props as getters.
    Object.defineProperties(plugin.props, {
      scrollThreshold: {
        enumerable: true,
        get: () => sides(scrollportTopReserve(current), 0),
      },
      scrollMargin: {
        enumerable: true,
        get: () => sides(scrollportTopReserve(current) + DEFAULT_SCROLL_MARGIN, DEFAULT_SCROLL_MARGIN),
      },
    });
    return [plugin];
  },
});

export default ScrollportToolbarMargin;
