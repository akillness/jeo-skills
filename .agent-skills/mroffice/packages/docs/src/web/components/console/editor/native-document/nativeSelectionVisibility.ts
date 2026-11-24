/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * ProseMirror hides the browser's own selection while the editor's is one
 * it draws itself (a selected object, a gap cursor, selected table cells, an
 * equation boundary): it puts `ProseMirror-hideselection` on the editor root,
 * and the editor stylesheet makes every element under that class drop its
 * selection highlight and caret. In WebKit a class on the root that such a
 * rule keys on restyles every element of the document, 330-410 ms on a
 * 16-sheet document, each time an arrow key lands on an object and again
 * when it leaves.
 *
 * This document editor keeps that class off its root and hides the browser's
 * selection on the smallest node that holds the whole selection instead (the
 * browser's selection lies between its two ends): a sheet, a table, a cell.
 * A selection whose smallest holder is the document itself still takes the
 * class on the root, as before.
 */
export const NATIVE_SELECTION_HIDDEN_ATTR = "data-native-selection-hidden";
const HIDE_SELECTION_CLASS = "ProseMirror-hideselection";

const nativeSelectionVisibilityKey = new PluginKey("nativeSelectionVisibility");

/** The position before the smallest node holding the selection, when that
 * node is not the document. */
function selectionHolder(state: EditorState): { from: number; to: number } | null {
  const { selection } = state;
  if (selection.visible) return null;
  const { $from, $to } = selection;
  const depth = $from.sharedDepth($to.pos);
  if (depth < 1) return null;
  const from = $from.before(depth);
  return { from, to: from + $from.node(depth).nodeSize };
}

function hiddenSelectionDecorations(state: EditorState): DecorationSet {
  const holder = selectionHolder(state);
  if (!holder) return DecorationSet.empty;
  return DecorationSet.create(state.doc, [
    Decoration.node(holder.from, holder.to, { [NATIVE_SELECTION_HIDDEN_ATTR]: "true" }),
  ]);
}

/** Keep `ProseMirror-hideselection` off the root while a holder node hides
 * the selection. ProseMirror sets the class itself, after the state the view
 * shows is in place, so the class list of this one root answers for it. */
function keepHideSelectionOffRoot(view: EditorView): () => void {
  const list = view.dom.classList;
  const add = DOMTokenList.prototype.add;
  Object.defineProperty(list, "add", {
    configurable: true,
    value(this: DOMTokenList, ...tokens: string[]) {
      const kept =
        tokens.includes(HIDE_SELECTION_CLASS) && !view.isDestroyed && selectionHolder(view.state)
          ? tokens.filter((token) => token !== HIDE_SELECTION_CLASS)
          : tokens;
      if (kept.length) add.apply(this, kept);
    },
  });
  return () => {
    delete (list as unknown as { add?: unknown }).add;
  };
}

export const NativeSelectionVisibility = Extension.create({
  name: "nativeSelectionVisibility",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: nativeSelectionVisibilityKey,
        props: { decorations: hiddenSelectionDecorations },
        view(view) {
          const restore = keepHideSelectionOffRoot(view);
          return { destroy: restore };
        },
      }),
    ];
  },
});

export default NativeSelectionVisibility;
