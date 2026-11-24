/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, Selection } from "@tiptap/pm/state";

const documentPointerFocusCaretKey = new PluginKey("documentPointerFocusCaret");

/**
 * The click that FOCUSES the document also places its caret.
 *
 * ProseMirror leaves an ordinary click's caret to the browser: on mouseup it
 * only tags the coming selection change as "pointer" and reads the DOM
 * selection when `selectionchange` arrives. Focusing this editor dispatches
 * transactions of its own (the inactive-selection highlight clears, TipTap's
 * focus meta, and a frame later the auto line-spacing projection republishes
 * its decorations). A transaction that redraws decorations also writes the
 * STATE selection back to the DOM — and until `selectionchange` has been read,
 * the state still holds the selection from before the click. When that write
 * lands after the browser placed the caret, the click is lost: the editor takes
 * focus, the caret stays where it was, and typing goes there. Measured in the
 * signed-in editor: mousedown, the two focus transactions 11 ms later, mouseup,
 * the projection's transaction 2 ms after that, and no pointer selection at all
 * (3 of 3 fast clicks).
 *
 * ProseMirror already has the answer for a click it cannot trust the DOM for
 * (`MouseDown.up`, the `flushed` branch): set the selection from the click's own
 * document position. This does exactly that, only for the click that arrives
 * while the editor is unfocused; every later click keeps the native path.
 * Clicks on a leaf or selectable node, modified clicks, and positions that hold
 * no inline content (gap cursors, block boundaries) are left to their handlers.
 */
export const DocumentPointerFocusCaret = Extension.create({
  name: "documentPointerFocusCaret",
  // After every other click handler: they decide first.
  priority: 1,

  addProseMirrorPlugins() {
    let focusingClick = false;
    return [new Plugin({
      key: documentPointerFocusCaretKey,
      props: {
        handleDOMEvents: {
          mousedown(view, event) {
            focusingClick = event.button === 0 && !event.shiftKey && !view.hasFocus();
            return false;
          },
        },
        handleClick(view, pos, event) {
          const armed = focusingClick;
          focusingClick = false;
          if (!armed || event.button !== 0) return false;
          if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
          const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!hit) return false;
          const inside = hit.inside >= 0 ? view.state.doc.nodeAt(hit.inside) : null;
          if (inside && (inside.isLeaf || NodeSelection.isSelectable(inside)) && !inside.isTextblock) {
            return false;
          }
          const $pos = view.state.doc.resolve(pos);
          if (!$pos.parent.inlineContent) return false;
          const selection = Selection.near($pos);
          if (view.state.selection.eq(selection)) return false;
          view.dispatch(view.state.tr.setSelection(selection).setMeta("pointer", true));
          return true;
        },
      },
    })];
  },
});

export default DocumentPointerFocusCaret;
