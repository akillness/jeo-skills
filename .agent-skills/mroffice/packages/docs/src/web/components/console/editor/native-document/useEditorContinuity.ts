/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, useRef } from "react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";

interface EditorPlace {
  readonly pageId: string;
  readonly doc: ProseMirrorNode;
  readonly from: number;
  readonly to: number;
  readonly hadFocus: boolean;
  readonly scroller: HTMLElement | null;
  readonly scrollTop: number;
  readonly at: number;
}

/** How long after the old editor went its place is still given to a new one. */
const PLACE_KEPT_MS = 10_000;
/** Frames a new editor may take to hold the document (about 10 s). */
const HYDRATION_FRAMES = 600;

const TEXT_BREAK = "\n";
const LEAF_TEXT = "￼";

function textOffset(doc: ProseMirrorNode, pos: number): number {
  return doc.textBetween(0, Math.max(0, Math.min(pos, doc.content.size)), TEXT_BREAK, LEAF_TEXT).length;
}

/** The first position of `doc` whose text before it is `offset` long (the end when it is shorter). */
export function positionAtTextOffset(doc: ProseMirrorNode, offset: number): number {
  let low = 0;
  let high = doc.content.size;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (textOffset(doc, middle) < offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

function scrollerOf(element: HTMLElement): HTMLElement | null {
  const view = element.ownerDocument.defaultView;
  for (let node = element.parentElement; node && view; node = node.parentElement) {
    const overflow = view.getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll" || overflow === "overlay") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

function capturePlace(editor: Editor, pageId: string): EditorPlace | null {
  try {
    const dom = editor.view.dom as HTMLElement;
    const scroller = scrollerOf(dom);
    const { from, to } = editor.state.selection;
    return {
      pageId,
      doc: editor.state.doc,
      from,
      to,
      hadFocus: editor.view.hasFocus(),
      scroller,
      scrollTop: scroller?.scrollTop ?? 0,
      at: performance.now(),
    };
  } catch {
    return null;
  }
}

function restorePlace(editor: Editor, place: EditorPlace): void {
  let frames = 0;
  const attempt = () => {
    if (editor.isDestroyed) return;
    const { doc } = editor.state;
    // Until the new binding has filled the document there is no place to
    // give: it opens on a part of it (or none) and fills the rest in after.
    const filled = doc.textContent.length >= place.doc.textContent.length * 0.9;
    if (!filled && frames < HYDRATION_FRAMES) {
      frames += 1;
      requestAnimationFrame(attempt);
      return;
    }
    const same = doc.eq(place.doc);
    const from = same ? place.from : positionAtTextOffset(doc, textOffset(place.doc, place.from));
    const to = same ? place.to : positionAtTextOffset(doc, textOffset(place.doc, place.to));
    try {
      const selection = TextSelection.between(doc.resolve(Math.min(from, doc.content.size)), doc.resolve(Math.min(to, doc.content.size)));
      editor.view.dispatch(editor.state.tr.setSelection(selection).setMeta("addToHistory", false));
    } catch {
      // A place the new document cannot hold: it keeps its own caret.
    }
    const scroller = place.scroller?.isConnected ? place.scroller : scrollerOf(editor.view.dom as HTMLElement);
    if (place.hadFocus) {
      try {
        (editor.view.dom as HTMLElement).focus({ preventScroll: true });
      } catch {
        // A view that cannot take the focus is left without it.
      }
    }
    if (scroller) {
      scroller.scrollTop = place.scrollTop;
      // Once more after the frame the new editor lays itself out in.
      requestAnimationFrame(() => {
        if (scroller.isConnected) scroller.scrollTop = place.scrollTop;
      });
    }
  };
  requestAnimationFrame(attempt);
}

/**
 * Keep the writer's caret, scroll and focus when `editor` is replaced by a
 * new editor of the same page (see the module note). The place is kept up to
 * date while an editor lives -- each change, focus and scroll -- so it is
 * there whichever comes first, the new editor or the old one's destruction.
 */
export function useEditorContinuity(editor: Editor | null, pageId: string): void {
  const place = useRef<(EditorPlace & { readonly editor: Editor }) | null>(null);
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const previous = place.current;
    if (
      previous &&
      previous.editor !== editor &&
      previous.pageId === pageId &&
      performance.now() - previous.at < PLACE_KEPT_MS
    ) {
      restorePlace(editor, previous);
    }
    let scroller: HTMLElement | null = null;
    const record = () => {
      if (editor.isDestroyed) return;
      const captured = capturePlace(editor, pageId);
      if (!captured) return;
      remember(captured);
    };
    // A transaction moves the caret and changes the document; the scroll
    // box and its offset are what the last full reading found (a scroll
    // fires the scroll event below, which reads them again). Finding the
    // scroll box read every ancestor's style and scroll height: a forced
    // layout per transaction, ~1 s in two minutes of a 298-page book's
    // background layout.
    const recordTransaction = () => {
      if (editor.isDestroyed) return;
      const last = place.current;
      if (!scroller || !scroller.isConnected || !last || last.editor !== editor) {
        record();
        return;
      }
      try {
        const { from, to } = editor.state.selection;
        place.current = { ...last, doc: editor.state.doc, from, to, hadFocus: editor.view.hasFocus(), at: performance.now() };
      } catch {
        record();
      }
    };
    const remember = (captured: EditorPlace) => {
      if (captured.scroller !== scroller) {
        scroller?.removeEventListener("scroll", record);
        scroller = captured.scroller;
        scroller?.addEventListener("scroll", record, { passive: true });
      }
      place.current = { ...captured, editor };
    };
    // The new editor's own first frames (its document filled, the place given
    // back) are not the writer's: recorded from then on.
    let inner = 0;
    const start = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        editor.on("transaction", recordTransaction);
        editor.on("focus", record);
        editor.on("blur", record);
        record();
      });
    });
    return () => {
      cancelAnimationFrame(start);
      cancelAnimationFrame(inner);
      editor.off("transaction", recordTransaction);
      editor.off("focus", record);
      editor.off("blur", record);
      scroller?.removeEventListener("scroll", record);
    };
  }, [editor, pageId]);
}
