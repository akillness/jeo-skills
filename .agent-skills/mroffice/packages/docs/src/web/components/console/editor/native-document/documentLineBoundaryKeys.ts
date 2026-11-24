/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";

import { isMacPlatform } from "@mrnote/core/web/lib/mac-platform.ts";
import { isImeCompositionActive } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";

const documentLineBoundaryKeysKey = new PluginKey("documentLineBoundaryKeys");

type ModifiableSelection = globalThis.Selection & {
  modify?: (
    alter: "move" | "extend",
    direction: "forward" | "backward",
    granularity: string,
  ) => void;
};

interface LineGeometryView {
  readonly state: { readonly doc: ProseMirrorNode };
  coordsAtPos(pos: number, side?: number): { top: number; bottom: number; left: number; right: number };
}

/**
 * Where Home (`forward` false) or End takes the caret at `head`: the first or
 * last position of the visual line the caret is on, judged by the boxes of
 * the characters themselves. The line is the one of the character after the
 * caret (before it, at the paragraph's end); from there each neighbour whose
 * box sits on that line belongs to it. The caret's own box is never read: at
 * a paragraph's end it can be a zero-height box below the line (the
 * paragraph mark drawn after the text), and the engine's line-boundary move
 * took that for another line -- Home stayed put in a new centred paragraph,
 * or End did (corpus R297-D26). Null outside a text block.
 */
export function documentLineBoundary(view: LineGeometryView, head: number, forward: boolean): number | null {
  const $head = view.state.doc.resolve(head);
  if (!$head.parent.isTextblock) return null;
  const start = $head.start();
  const end = $head.end();
  if (start === end) return head;
  const box = (pos: number) => {
    try {
      const rect = view.coordsAtPos(pos, 1);
      return rect.bottom > rect.top ? rect : null;
    } catch {
      return null;
    }
  };
  // A line break ends its line whatever box it draws: an auto-spaced line's
  // `<br>` can sit below the words it ends (corpus R329-D17: read as the line,
  // Home stayed put before it, and the next Backspace took a letter).
  const isLineBreak = (pos: number) => {
    const node = view.state.doc.nodeAt(pos);
    if (node?.type.name === "hardBreak") return true;
    return Boolean(node?.isText) && view.state.doc.textBetween(pos, pos + 1) === "\n";
  };
  // The line: the character after the caret, or the one before it at the end
  // or before a line break.
  const reference =
    head < end && !isLineBreak(head) ? box(head) ?? (head > start ? box(head - 1) : null) : head > start ? box(head - 1) : null;
  if (!reference) return head < end && isLineBreak(head) && head === start ? head : null;
  const middle = (reference.top + reference.bottom) / 2;
  const onLine = (pos: number) => {
    if (isLineBreak(pos)) return false;
    const rect = box(pos);
    if (!rect) return true; // a box-less inline (a widget, a zero-width mark) goes with its neighbours
    return rect.top <= middle && middle <= rect.bottom;
  };
  if (forward) {
    let pos = head;
    while (pos < end && onLine(pos)) pos += 1;
    return pos;
  }
  let pos = head;
  while (pos > start && onLine(pos - 1)) pos -= 1;
  return pos;
}

/**
 * Home / End: the visual line's start or end (`documentLineBoundary`), on
 * every platform -- at a paragraph's end the engine's own move misread the
 * line on Windows and Linux too (R297-D26). End at a soft wrap stays the
 * engine's (below).
 *
 * Home / End on macOS.
 *
 * On Windows and Linux the browser's own editing behaviour already moves the
 * caret to the visual line boundary. On macOS the engine binds Home/End to
 * scroll-to-document-edge and leaves the caret where it was, so in a document
 * the keys appear dead. Word for Mac (Microsoft Support, "Keyboard shortcuts
 * in Word", macOS: "End of line: Cmd+Right arrow or End", "Beginning of
 * document: Cmd+Home", with Shift extending the selection) gives them the same
 * meaning as on Windows; this reproduces that mapping. The line boundary is
 * the engine's own visual-line computation (Selection.modify "lineboundary",
 * the operation behind Cmd+Arrow), so wrapping, bidi and the nested line boxes
 * of auto line spacing resolve exactly as they do for the native chord.
 */
export const DocumentLineBoundaryKeys = Extension.create({
  name: "documentLineBoundaryKeys",

  addProseMirrorPlugins() {
    return [new Plugin({
      key: documentLineBoundaryKeysKey,
      props: {
        handleKeyDown(view, event) {
          if (event.key !== "Home" && event.key !== "End") return false;
          if (event.altKey || (event.ctrlKey && isMacPlatform())) return false;
          // Ctrl+Home / Ctrl+End elsewhere is the document's start or end.
          if (event.ctrlKey && !isMacPlatform()) return false;
          if (isImeCompositionActive(view, event)) return false;
          const forward = event.key === "End";
          const { state } = view;
          if (event.metaKey && !isMacPlatform()) return false;
          if (event.metaKey) {
            const edge = forward ? Selection.atEnd(state.doc) : Selection.atStart(state.doc);
            const selection = event.shiftKey
              ? TextSelection.between(state.selection.$anchor, edge.$head, forward ? 1 : -1)
              : edge;
            view.dispatch(state.tr.setSelection(selection).scrollIntoView());
            return true;
          }
          // Objects and gap cursors keep their own boundary navigation.
          if (!(state.selection instanceof TextSelection)) return false;
          const target = documentLineBoundary(view, state.selection.head, forward);
          // End at a soft wrap is the engine's: only it shows the caret at the
          // end of the upper line there (a selection at that position draws at
          // the start of the next).
          const softWrapEnd = forward && target !== null && target < state.selection.$head.end();
          if (target === null || softWrapEnd) {
            // The engine's own visual-line move.
            if (!isMacPlatform()) return false;
            const domSelection = view.dom.ownerDocument.getSelection() as ModifiableSelection | null;
            if (!domSelection?.modify || !view.dom.contains(domSelection.focusNode)) return false;
            domSelection.modify(event.shiftKey ? "extend" : "move", forward ? "forward" : "backward",
              "lineboundary");
            return true;
          }
          const selection = event.shiftKey
            ? TextSelection.create(state.doc, state.selection.anchor, target)
            : TextSelection.create(state.doc, target);
          view.dispatch(state.tr.setSelection(selection).scrollIntoView());
          return true;
        },
      },
    })];
  },
});

export default DocumentLineBoundaryKeys;
