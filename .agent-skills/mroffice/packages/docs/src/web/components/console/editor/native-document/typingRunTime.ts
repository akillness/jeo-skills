"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { editorInputTime, endEditorInput, noteEditorInput } from "@mrnote/core/web/lib/editor/typing-run-time.ts";

/**
 * An edit made from an input event is dated by that event: a typing run is
 * one Undo step however long each key's own dispatch takes on a long page
 * (lib/editor/typing-run-time). prosemirror-history reads the transaction's
 * time; the shared document's history reads it through the paged bridge.
 */
export const TypingRunTime = Extension.create({
  name: "typingRunTime",
  // Ahead of every other DOM handler, which may take the event.
  priority: 1001,

  dispatchTransaction({ transaction, next }) {
    if (transaction.docChanged) {
      let at: number | null = null;
      try {
        at = editorInputTime(this.editor.view);
      } catch {
        // Not mounted: no input to date it by.
      }
      if (at !== null && at < transaction.time) transaction.setTime(at);
    }
    next(transaction);
  },

  addProseMirrorPlugins() {
    const note = (view: Parameters<typeof noteEditorInput>[0], event: Event) => {
      noteEditorInput(view, event);
      return false;
    };
    return [
      new Plugin({
        key: new PluginKey("typingRunTime"),
        props: {
          handleDOMEvents: {
            keydown: note,
            beforeinput: note,
            compositionend: note,
            paste: note,
            cut: note,
            drop: note,
          },
        },
        // A press anywhere (the page, a toolbar, a menu) ends the input
        // before it: a command it makes is not dated as that typing.
        view(view) {
          const end = () => endEditorInput(view);
          const doc = view.dom.ownerDocument;
          doc.addEventListener("pointerdown", end, true);
          return { destroy: () => doc.removeEventListener("pointerdown", end, true) };
        },
      }),
    ];
  },
});

export default TypingRunTime;
