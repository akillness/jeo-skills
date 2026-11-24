/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's keyboard shortcuts for the document editor, by platform.
 *
 * From Microsoft Support, "Keyboard shortcuts in Word" (its Windows and Mac
 * sections):
 *
 * | Command                          | Windows            | Mac                |
 * |----------------------------------|--------------------|--------------------|
 * | Page break                       | Ctrl+Enter         | ⌘Return            |
 * | Center / left / right / justify  | Ctrl+E / L / R / J | ⌘E / L / R / J     |
 * | Apply the Normal style           | Ctrl+Shift+N       | ⌘⇧N                |
 * | Track changes on or off          | Ctrl+Shift+E       | ⌘⇧E                |
 * | Copy / paste formatting          | Ctrl+Alt+C / V     | ⌘⌥C / ⌘⌥V          |
 * | Find                             | Ctrl+F             | ⌘F                 |
 * | Find and Replace                 | Ctrl+H             | Control+H          |
 * | Insert a footnote                | Ctrl+Alt+F         | ⌘⌥F                |
 * | Insert an endnote                | Ctrl+Alt+D         | ⌘⌥E                |
 * | Go To                            | Ctrl+G             | ⌘⌥G or F5          |
 * | Insert a comment                 | Ctrl+Alt+M         | ⌘⌥A                |
 * | Subscript                        | Ctrl+Shift+Minus   | ⌘⇧Minus            |
 * | Superscript                      | Ctrl+Shift+Plus    | (no row)           |
 * | Display nonprinting characters   | Ctrl+Shift+8       | (no row)           |
 *
 * Word has long applied subscript with Ctrl/⌘+= as well, and superscript
 * with Ctrl/⌘+Shift+= (the plus key); both are kept. Word for Mac shows and
 * hides formatting marks with ⌘8 (⌘⇧8 is accepted too). Shift+Enter (a line
 * break), Ctrl/⌘+Alt+1-3 (headings), Ctrl/⌘+Shift+> and < (font size), the
 * text formats and Undo/Redo are the editor's own keymaps and already match.
 */
export type WordShortcutCommand =
  | "pageBreak"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignJustify"
  | "normalStyle"
  | "trackChanges"
  | "copyFormatting"
  | "pasteFormatting"
  | "find"
  | "findReplace"
  | "footnote"
  | "endnote"
  | "goTo"
  | "comment"
  | "subscript"
  | "superscript"
  | "formattingMarks"
  | "insertEquation"
  | "fontDialog"
  | "smallCaps"
  | "allCaps"
  | "doubleUnderline"
  | "wordUnderline"
  | "indentParagraph"
  | "removeIndent"
  | "hangingIndent"
  | "removeHangingIndent"
  | "lineSpacingSingle"
  | "lineSpacingDouble"
  | "lineSpacingOneAndHalf"
  | "heading1"
  | "heading2"
  | "heading3"
  | "listStyle"
  | "insertDateField"
  | "insertPageField"
  | "insertTimeField"
  | "spellingAndGrammar"
  | "nextProofingError"
  | "updateFields"
  | "toggleFieldCodes"
  | "toggleAllFieldCodes"
  | "insertField"
  | "unlinkFields"
  | "lockFields"
  | "unlockFields"
  | "revealFormatting";

/** The commands that change the document (the rest open a pane or a dialog). */
export const WORD_SHORTCUT_EDITS: ReadonlySet<WordShortcutCommand> = new Set([
  "pageBreak",
  "alignLeft",
  "alignCenter",
  "alignRight",
  "alignJustify",
  "normalStyle",
  "trackChanges",
  "pasteFormatting",
  "footnote",
  "endnote",
  "comment",
  "subscript",
  "superscript",
  "insertEquation",
  "smallCaps",
  "allCaps",
  "doubleUnderline",
  "wordUnderline",
  "indentParagraph",
  "removeIndent",
  "hangingIndent",
  "removeHangingIndent",
  "lineSpacingSingle",
  "lineSpacingDouble",
  "lineSpacingOneAndHalf",
  "heading1",
  "heading2",
  "heading3",
  "listStyle",
  "insertDateField",
  "insertPageField",
  "insertTimeField",
  "updateFields",
  "unlinkFields",
  "lockFields",
  "unlockFields",
]);

export interface WordShortcutKey {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type WordShortcutModifiers =
  | ""
  | "mod"
  | "mod+shift"
  | "mod+alt"
  | "ctrl"
  | "alt"
  | "shift"
  | "ctrl+shift"
  | "alt+shift";
type Modifiers = WordShortcutModifiers;

// The physical key (`code`): Option on a Mac and AltGr elsewhere change the
// character a letter key types, and Shift changes = into + and 8 into *.
const LETTER_CODE = /^Key([A-Z])$/;
function keyOf(event: WordShortcutKey): string {
  const letter = LETTER_CODE.exec(event.code);
  if (letter) return letter[1].toLowerCase();
  if (event.code === "Equal" || event.code === "NumpadEqual") return "=";
  if (event.code === "Minus") return "-";
  const digit = /^Digit(\d)$/.exec(event.code);
  if (digit) return digit[1];
  if (event.key === "Enter") return "enter";
  if (/^F\d{1,2}$/.test(event.key)) return event.key.toLowerCase();
  // A synthetic event without a code: its key, as typed.
  return event.code ? "" : event.key.toLowerCase();
}

const MAC: ReadonlyArray<[Modifiers, string, WordShortcutCommand]> = [
  ["mod", "enter", "pageBreak"],
  ["mod", "l", "alignLeft"],
  ["mod", "e", "alignCenter"],
  ["mod", "r", "alignRight"],
  ["mod", "j", "alignJustify"],
  ["mod+shift", "n", "normalStyle"],
  ["mod+shift", "e", "trackChanges"],
  ["mod+alt", "c", "copyFormatting"],
  ["mod+alt", "v", "pasteFormatting"],
  ["mod", "f", "find"],
  ["ctrl", "h", "findReplace"],
  ["mod+alt", "f", "footnote"],
  ["mod+alt", "e", "endnote"],
  ["mod+alt", "g", "goTo"],
  ["", "f5", "goTo"],
  ["mod+alt", "a", "comment"],
  ["mod", "=", "subscript"],
  ["mod+shift", "-", "subscript"],
  ["mod+shift", "=", "superscript"],
  ["mod", "8", "formattingMarks"],
  ["mod+shift", "8", "formattingMarks"],
  // Insert New Equation: Control+= in Word for Mac (Option+= types ≠).
  ["ctrl", "=", "insertEquation"],
  // Microsoft Support, "Keyboard shortcuts in Word" (macOS).
  ["mod", "d", "fontDialog"],
  ["mod+shift", "k", "smallCaps"],
  ["mod+shift", "a", "allCaps"],
  ["mod+shift", "d", "doubleUnderline"],
  ["mod+shift", "w", "wordUnderline"],
  ["ctrl+shift", "m", "indentParagraph"],
  ["mod+shift", "m", "removeIndent"],
  ["mod", "t", "hangingIndent"],
  ["mod+shift", "t", "removeHangingIndent"],
  ["mod", "1", "lineSpacingSingle"],
  ["mod", "2", "lineSpacingDouble"],
  ["mod", "5", "lineSpacingOneAndHalf"],
  ["mod+alt", "1", "heading1"],
  ["mod+alt", "2", "heading2"],
  ["mod+alt", "3", "heading3"],
  ["mod+shift", "l", "listStyle"],
  ["ctrl+shift", "d", "insertDateField"],
  ["ctrl+shift", "p", "insertPageField"],
  ["ctrl+shift", "t", "insertTimeField"],
  ["", "f7", "spellingAndGrammar"],
  ["mod+alt", "l", "spellingAndGrammar"],
  ["alt", "f7", "nextProofingError"],
  // Work with fields (the same keys on both platforms, Command for Ctrl).
  ["", "f9", "updateFields"],
  ["shift", "f9", "toggleFieldCodes"],
  ["alt", "f9", "toggleAllFieldCodes"],
  ["mod", "f9", "insertField"],
  ["mod+shift", "f9", "unlinkFields"],
  ["mod", "f11", "lockFields"],
  ["mod+shift", "f11", "unlockFields"],
  // Reveal Formatting (Shift+F1).
  ["shift", "f1", "revealFormatting"],
];

const OTHER: ReadonlyArray<[Modifiers, string, WordShortcutCommand]> = [
  ["mod", "enter", "pageBreak"],
  ["mod", "l", "alignLeft"],
  ["mod", "e", "alignCenter"],
  ["mod", "r", "alignRight"],
  ["mod", "j", "alignJustify"],
  ["mod+shift", "n", "normalStyle"],
  ["mod+shift", "e", "trackChanges"],
  ["mod+alt", "c", "copyFormatting"],
  ["mod+alt", "v", "pasteFormatting"],
  ["mod", "f", "find"],
  ["mod", "h", "findReplace"],
  ["mod+alt", "f", "footnote"],
  ["mod+alt", "d", "endnote"],
  ["mod", "g", "goTo"],
  ["mod+alt", "m", "comment"],
  ["mod", "=", "subscript"],
  ["mod+shift", "-", "subscript"],
  ["mod+shift", "=", "superscript"],
  ["mod+shift", "8", "formattingMarks"],
  // Insert New Equation (Alt+=).
  ["alt", "=", "insertEquation"],
  // Microsoft Support, "Keyboard shortcuts in Word" (Windows).
  ["mod", "d", "fontDialog"],
  ["mod+shift", "k", "smallCaps"],
  ["mod+shift", "a", "allCaps"],
  ["mod+shift", "d", "doubleUnderline"],
  ["mod+shift", "w", "wordUnderline"],
  ["mod", "m", "indentParagraph"],
  ["mod+shift", "m", "removeIndent"],
  ["mod", "t", "hangingIndent"],
  ["mod+shift", "t", "removeHangingIndent"],
  ["mod", "1", "lineSpacingSingle"],
  ["mod", "2", "lineSpacingDouble"],
  ["mod", "5", "lineSpacingOneAndHalf"],
  ["mod+alt", "1", "heading1"],
  ["mod+alt", "2", "heading2"],
  ["mod+alt", "3", "heading3"],
  ["mod+shift", "l", "listStyle"],
  ["alt+shift", "d", "insertDateField"],
  ["alt+shift", "p", "insertPageField"],
  ["alt+shift", "t", "insertTimeField"],
  ["", "f7", "spellingAndGrammar"],
  ["alt", "f7", "nextProofingError"],
  // Work with fields (the same keys on both platforms, Command for Ctrl).
  ["", "f9", "updateFields"],
  ["shift", "f9", "toggleFieldCodes"],
  ["alt", "f9", "toggleAllFieldCodes"],
  ["mod", "f9", "insertField"],
  ["mod+shift", "f9", "unlinkFields"],
  ["mod", "f11", "lockFields"],
  ["mod+shift", "f11", "unlockFields"],
  // Reveal Formatting (Shift+F1).
  ["shift", "f1", "revealFormatting"],
];

function modifiersOf(event: WordShortcutKey, mac: boolean): Modifiers | null {
  const mod = mac ? event.metaKey : event.ctrlKey;
  const other = mac ? event.ctrlKey : event.metaKey;
  if (!mod) {
    if (mac && event.ctrlKey && !event.metaKey && !event.altKey) return event.shiftKey ? "ctrl+shift" : "ctrl";
    if (event.altKey && !event.ctrlKey && !event.metaKey) return event.shiftKey ? "alt+shift" : "alt";
    if (!event.ctrlKey && !event.metaKey && !event.altKey) return event.shiftKey ? "shift" : "";
    return null;
  }
  if (other) return null;
  if (event.altKey && event.shiftKey) return null;
  if (event.altKey) return "mod+alt";
  if (event.shiftKey) return "mod+shift";
  return "mod";
}

/** The Word command `event` is the shortcut of on this platform, or null. */
export function wordShortcutCommand(event: WordShortcutKey, mac: boolean): WordShortcutCommand | null {
  const modifiers = modifiersOf(event, mac);
  if (modifiers === null) return null;
  const key = keyOf(event);
  if (!key) return null;
  // Ctrl+Alt is AltGr on many Windows keyboards: a letter that typed some
  // other character (ć, @, €) is typing, not a shortcut.
  if (!mac && modifiers === "mod+alt" && event.key.length === 1 && event.key.toLowerCase() !== key) {
    return null;
  }
  for (const [needs, name, command] of mac ? MAC : OTHER) {
    if (needs === modifiers && name === key) return command;
  }
  return null;
}

const MAC_MODIFIER_GLYPHS: Record<WordShortcutModifiers, string> = {
  "": "",
  mod: "⌘",
  // Apple's order: Control, Option, Shift, Command.
  "mod+shift": "⇧⌘",
  "mod+alt": "⌥⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  "ctrl+shift": "⌃⇧",
  "alt+shift": "⌥⇧",
};
const OTHER_MODIFIER_NAMES: Record<WordShortcutModifiers, string> = {
  "": "",
  mod: "Ctrl+",
  "mod+shift": "Ctrl+Shift+",
  "mod+alt": "Ctrl+Alt+",
  ctrl: "Ctrl+",
  alt: "Alt+",
  shift: "Shift+",
  "ctrl+shift": "Ctrl+Shift+",
  "alt+shift": "Alt+Shift+",
};

/** A shortcut as the platform writes it: ⇧⌘E on a Mac, Ctrl+Shift+E elsewhere. */
export function formatShortcut(
  modifiers: WordShortcutModifiers,
  key: string,
  mac: boolean,
): string {
  const name = key === "enter" ? (mac ? "↩" : "Enter") : key.toUpperCase();
  return mac
    ? `${MAC_MODIFIER_GLYPHS[modifiers]}${name}`
    : `${OTHER_MODIFIER_NAMES[modifiers]}${name}`;
}

/** The first shortcut of a Word command on this platform, as it is written. */
export function wordShortcutLabel(
  command: WordShortcutCommand,
  mac: boolean,
): string | undefined {
  const row = (mac ? MAC : OTHER).find(([, , name]) => name === command);
  return row ? formatShortcut(row[0], row[1], mac) : undefined;
}
