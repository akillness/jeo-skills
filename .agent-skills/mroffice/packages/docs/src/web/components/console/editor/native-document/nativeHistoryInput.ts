"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * The browser's own Undo / Redo reaches the editor as `beforeinput`
 * historyUndo / historyRedo: the Edit menu, or Cmd+Z pressed where neither the
 * editor's keymap nor the document window's shortcut takes the key. WebKit
 * sends one such event per entry of its native undo stack (one per typed
 * character) in a single task, draining it. prosemirror-history ran an undo
 * for each, so one press after clicking Accept undid every step; the
 * collaborative history had no handler at all, and WebKit rewrote the text
 * itself.
 *
 * Here each gesture is exactly one editor undo or redo, through the editor's
 * own history (local or collaborative); the rest of its burst is dropped and
 * the browser never edits the DOM on its own.
 */
export const NativeHistoryInput = Extension.create({
  name: "nativeHistoryInput",
  // Ahead of prosemirror-history's own beforeinput handler.
  priority: 1000,

  addProseMirrorPlugins() {
    const editor = this.editor;
    let burst: ReturnType<typeof setTimeout> | null = null;
    return [
      new Plugin({
        key: new PluginKey("nativeHistoryInput"),
        props: {
          handleDOMEvents: {
            beforeinput(view, event) {
              const { inputType } = event as InputEvent;
              if (inputType !== "historyUndo" && inputType !== "historyRedo") {
                return false;
              }
              event.preventDefault();
              if (burst !== null || !view.editable) return true;
              burst = setTimeout(() => {
                burst = null;
              }, 0);
              if (inputType === "historyUndo") editor.commands.undo();
              else editor.commands.redo();
              return true;
            },
          },
        },
      }),
    ];
  },
});

export default NativeHistoryInput;
