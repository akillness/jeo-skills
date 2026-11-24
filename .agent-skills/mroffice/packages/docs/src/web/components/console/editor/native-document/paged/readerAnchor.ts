/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export interface ReaderAnchor {
  readonly pos: number;
  /** The anchor's top, from the scroller's top. */
  readonly top: number;
  readonly scroller: HTMLElement;
}

/** The reader moved the view this recently (wheel, touch, scroll not ours). */
const READER_SCROLL_QUIET_MS = 150;

interface ScrollWatch { lastReaderAt: number; pointerDown: boolean; ownScrollTop: number | null }
const watches = new WeakMap<HTMLElement, ScrollWatch>();

function watchOf(scroller: HTMLElement): ScrollWatch {
  let watch = watches.get(scroller);
  if (watch) return watch;
  const state: ScrollWatch = { lastReaderAt: 0, pointerDown: false, ownScrollTop: null };
  const reader = () => { state.lastReaderAt = performance.now(); };
  const options = { passive: true, capture: true } as const;
  scroller.addEventListener("wheel", reader, options);
  scroller.addEventListener("touchmove", reader, options);
  scroller.addEventListener("pointerdown", () => { state.pointerDown = true; reader(); }, options);
  scroller.ownerDocument.addEventListener("pointerup", () => { state.pointerDown = false; }, options);
  scroller.addEventListener("scroll", () => {
    // A scroll this module made is not the reader's.
    if (state.ownScrollTop !== null && Math.abs(scroller.scrollTop - state.ownScrollTop) < 1) {
      state.ownScrollTop = null;
      return;
    }
    reader();
  }, options);
  watches.set(scroller, state);
  watch = state;
  return watch;
}

function scrollerOf(view: EditorView): HTMLElement | null {
  const win = view.dom.ownerDocument.defaultView;
  if (!win) return null;
  let scroller: HTMLElement | null = view.dom.parentElement;
  while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 1 && /auto|scroll|overlay/.test(win.getComputedStyle(scroller).overflowY))) {
    scroller = scroller.parentElement;
  }
  return scroller;
}

/** Whether the reader is moving the view now. */
function readerMoving(scroller: HTMLElement): boolean {
  const watch = watchOf(scroller);
  return watch.pointerDown || performance.now() - watch.lastReaderAt < READER_SCROLL_QUIET_MS;
}

/** What the reader is looking at, or null (nothing scrolled, no scroll box,
 * the reader moving the view, nothing of the editor in view). */
export function readerAnchor(view: EditorView): ReaderAnchor | null {
  if (view.isDestroyed) return null;
  const scroller = scrollerOf(view);
  if (!scroller || scroller.scrollTop <= 0 || readerMoving(scroller)) return null;
  const band = scroller.getBoundingClientRect();
  const editor = view.dom.getBoundingClientRect();
  const top = Math.max(band.top, editor.top);
  const bottom = Math.min(band.bottom, editor.bottom);
  if (!(bottom > top)) return null;
  const inView = (pos: number): number | null => {
    try {
      const at = view.coordsAtPos(pos);
      return at.top >= top && at.bottom <= bottom ? at.top : null;
    } catch {
      return null;
    }
  };
  const head = view.state.selection.head;
  const caretTop = typeof view.hasFocus === "function" && view.hasFocus() ? inView(head) : null;
  if (caretTop !== null) return { pos: head, top: caretTop - band.top, scroller };
  const x = (Math.max(editor.left, band.left) + Math.min(editor.right, band.right)) / 2;
  // The text across the middle of the view (what the reader reads), then
  // nearer the top.
  const middle = (top + bottom) / 2;
  for (const y of [middle, ...Array.from({ length: 12 }, (_, index) => top + 8 + index * 20)]) {
    if (y >= bottom) continue;
    const found = view.posAtCoords({ left: x, top: y });
    if (!found) continue;
    const at = inView(found.pos);
    if (at !== null) return { pos: found.pos, top: at - band.top, scroller };
  }
  return null;
}

/** After `tr`: the anchor's text where it was in the view. */
export function keepReaderAnchor(view: EditorView, anchor: ReaderAnchor, tr: Transaction): void {
  if (!anchor.scroller.isConnected || view.isDestroyed || readerMoving(anchor.scroller)) return;
  // The text before the anchor stays with it: a part appended at the end of
  // what is loaded, where a reader scrolled past it rests, maps the end to
  // after the new text with a right bias (the view was moved 225 px down).
  const mapped = tr.mapping.mapResult(anchor.pos, -1);
  if (mapped.deleted) return;
  try {
    const now = view.coordsAtPos(mapped.pos).top - anchor.scroller.getBoundingClientRect().top;
    const drift = now - anchor.top;
    if (Math.abs(drift) < 1) return;
    const watch = watchOf(anchor.scroller);
    anchor.scroller.scrollTop += drift;
    watch.ownScrollTop = anchor.scroller.scrollTop;
  } catch {
    // A position the view does not draw.
  }
}

/** `view.dispatch(tr)` with the reader's view kept where it is. */
export function dispatchKeepingReader(view: EditorView, tr: Transaction): void {
  const anchor = readerAnchor(view);
  view.dispatch(tr);
  if (anchor) keepReaderAnchor(view, anchor, tr);
}
