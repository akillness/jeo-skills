/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  type Transaction,
} from "@tiptap/pm/state";

/**
 * Where the selection goes after a paste or a drop: at the end of what went
 * in, as in Word, never onto an object that was already in the document.
 *
 * ProseMirror puts the selection after a pasted block "near" the end of the
 * insertion looking forward; when the next thing is a selectable object (a
 * signature line, a text box) and no text lies between, that object became
 * the selection, and the next key typed replaced it -- a pasted signature
 * line selected the old one after it, and "q" deleted that (WUA 231).
 *
 * The selection then ends in the pasted text when there is any, else on the
 * pasted object itself (what inserting an object selects).
 */
const pasteSelectionEndKey = new PluginKey("pasteSelectionEnd");

/** The range the transaction's last replacement put in, in its own doc. */
function insertedRange(tr: Transaction): { from: number; to: number } | null {
  for (let index = tr.steps.length - 1; index >= 0; index -= 1) {
    let range: { from: number; to: number } | null = null;
    tr.mapping.maps[index]!.forEach((_from, _to, newFrom, newTo) => {
      range ??= { from: newFrom, to: newTo };
    });
    if (!range) continue;
    const later = tr.mapping.slice(index + 1);
    const { from, to } = range as { from: number; to: number };
    return { from: later.map(from, -1), to: later.map(to, 1) };
  }
  return null;
}

/** The selection to put after a paste in place of `selection`, or null. */
export function pasteEndSelection(
  doc: ProseMirrorNode,
  selection: Selection,
  inserted: { from: number; to: number },
): Selection | null {
  if (!(selection instanceof NodeSelection)) return null;
  // The pasted object itself, or one inside what went in: that is fine.
  if (selection.from >= inserted.from && selection.to <= inserted.to) return null;
  if (inserted.to <= inserted.from) return null;
  const end = doc.resolve(Math.min(inserted.to, doc.content.size));
  const text = Selection.findFrom(end, -1, true);
  if (text && text.from >= inserted.from) return text;
  const before = end.nodeBefore;
  const beforePos = end.pos - (before?.nodeSize ?? 0);
  if (
    before &&
    !before.isText &&
    NodeSelection.isSelectable(before) &&
    beforePos >= inserted.from
  ) {
    return NodeSelection.create(doc, beforePos);
  }
  return null;
}

export const PasteSelectionEnd = Extension.create({
  name: "pasteSelectionEnd",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pasteSelectionEndKey,
        appendTransaction(transactions, _oldState, newState) {
          const index = transactions.findIndex((tr) => {
            const event = tr.getMeta("uiEvent");
            return (event === "paste" || event === "drop") && tr.docChanged;
          });
          if (index < 0) return null;
          const paste = transactions[index]!;
          const range = insertedRange(paste);
          if (!range) return null;
          let { from, to } = range;
          for (const later of transactions.slice(index + 1)) {
            from = later.mapping.map(from, -1);
            to = later.mapping.map(to, 1);
          }
          const next = pasteEndSelection(newState.doc, newState.selection, { from, to });
          return next ? newState.tr.setSelection(next) : null;
        },
      }),
    ];
  },
});
