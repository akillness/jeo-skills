/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's keyboard shortcuts for the Special Characters the Symbol dialog lists.
 *
 * The bindings come from ONE place — `OFFICE_SPECIAL_CHARACTERS[].shortcut` in
 * `lib/office-symbols` — so the dialog's "Keyboard shortcut" column and the keys
 * that actually fire can never drift apart. A row with no `shortcut` gets no
 * binding and shows an empty cell, which is the honest answer: Word's own dialog
 * lists macOS dead-key sequences (Option+G for ©) that are the operating
 * system's text input rather than this application's bindings, and MRAI does not
 * claim them.
 *
 * The characters carrying a binding are the ones Word treats as application
 * commands. The en dash is deliberately unbound: Word's chord for it is
 * Ctrl/Cmd+Minus, which every browser owns for page zoom, so binding it would be
 * a shortcut that silently never fires.
 */

import { Extension } from "@tiptap/core";

import { OFFICE_SPECIAL_CHARACTERS } from "@mrnote/core/web/lib/office-symbols.ts";

export const SPECIAL_CHARACTER_SHORTCUTS_EXTENSION = "specialCharacterShortcuts";

/**
 * The data spells the key as a word ("Minus", "Period") so the dialog can label
 * it, but ProseMirror's keymap only aliases "Space": it matches the LAST token
 * against `KeyboardEvent.key` (or, with a modifier held, the US-layout base key
 * from `keyCode`), which is "-" / "." — never "Minus". Left untranslated the
 * binding was dead and the dialog advertised a chord that did nothing
 * (WUA 230). Translate to the character ProseMirror compares against.
 */
const PROSEMIRROR_KEY_TOKENS: Readonly<Record<string, string>> = {
  Minus: "-",
  Period: ".",
};

export function specialCharacterKeymapName(shortcut: string): string {
  const parts = shortcut.split("-");
  const key = parts[parts.length - 1] ?? "";
  const mapped = PROSEMIRROR_KEY_TOKENS[key];
  if (!mapped) return shortcut;
  return [...parts.slice(0, -1), mapped].join("-");
}

export const SpecialCharacterShortcuts = Extension.create({
  name: SPECIAL_CHARACTER_SHORTCUTS_EXTENSION,

  addKeyboardShortcuts() {
    const bindings: Record<string, () => boolean> = {};
    for (const entry of OFFICE_SPECIAL_CHARACTERS) {
      if (!entry.shortcut) continue;
      bindings[specialCharacterKeymapName(entry.shortcut)] = () => {
        // Read-only / destroyed editors must not accept an insertion: the
        // command chain would throw rather than no-op.
        if (!this.editor.isEditable) return false;
        return this.editor.commands.insertContent(entry.char);
      };
    }
    return bindings;
  },
});
