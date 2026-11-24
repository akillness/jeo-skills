/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";

/**
 * Word's shortcuts that are the editor's own commands, ahead of TipTap's
 * defaults on the same keys: Ctrl/⌘+Enter is Word's page break (TipTap's
 * HardBreak made it a line break, which is Shift+Enter), and Ctrl/⌘+E is
 * Word's Center (TipTap's inline Code mark took it). With a toolbar the
 * document window hears these first and runs its ribbon buttons
 * (wordKeyboardShortcuts.ts); this keymap is what an editor without one
 * does, and it keeps the TipTap defaults from ever running.
 */
export const WordEditorShortcuts = Extension.create({
  name: "wordEditorShortcuts",
  // Ahead of StarterKit's keymaps (priority 100).
  priority: 1_000,

  addKeyboardShortcuts() {
    // Handled even where nothing is changed (a read-only document): the key
    // is Word's, never the browser's (⌘R reloads the page, ⌘L takes the
    // address bar) nor TipTap's.
    const run = (edit: () => boolean) => () => {
      if (this.editor.isEditable) edit();
      return true;
    };
    return {
      "Mod-Enter": run(() => this.editor.commands.setPageBreak()),
      "Mod-l": run(() => this.editor.commands.setTextAlign("left")),
      "Mod-e": run(() => this.editor.commands.setTextAlign("center")),
      "Mod-r": run(() => this.editor.commands.setTextAlign("right")),
      "Mod-j": run(() => this.editor.commands.setTextAlign("justify")),
    };
  },
});

export default WordEditorShortcuts;
