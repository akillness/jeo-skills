/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import { selectionNearInlineContent } from "@mrnote/core/web/components/console/editor/native-document/safeTextSelection.ts";

const documentOpenCaretKey = new PluginKey("documentOpenCaret");

type BlockPlace = { blockId: string; offset: number };

/**
 * Where the caret is while a document opens, as Word has it: at the start,
 * until the reader or a command puts it somewhere.
 *
 * Opening fills the editor by replacing its whole content, and that left the
 * selection at the end of what came in. It stayed there unseen until something
 * focused the editor, which scrolled to it: a contract opened on its last page,
 * and text typed after a click that the still read-only surface had ignored
 * went into the signature table. So during opening a whole replacement leaves
 * the caret at the start, a click on the read-only surface is kept and takes
 * effect when the surface turns editable, and the keyboard reaches the document
 * then if nothing else holds it, without scrolling.
 */
export function replacesWholeDocument(transaction: Transaction): boolean {
  if (!transaction.docChanged) return false;
  const before = transaction.docs[0];
  if (!before) return false;
  const map = transaction.mapping.maps[0];
  let whole = false;
  map?.forEach((oldStart, oldEnd) => {
    if (oldStart <= 1 && oldEnd >= before.content.size - 1) whole = true;
  });
  return whole;
}

function blockPlaceAt(doc: ProseMirrorNode, position: number): BlockPlace | null {
  const resolved = doc.resolve(position);
  for (let depth = resolved.depth; depth >= 1; depth -= 1) {
    const blockId = resolved.node(depth).attrs?.block_id;
    if (typeof blockId === "string" && blockId) {
      return { blockId, offset: position - resolved.start(depth) };
    }
  }
  return null;
}

function selectionAtPlace(doc: ProseMirrorNode, place: BlockPlace): Selection | null {
  let found = -1;
  doc.descendants((node, position) => {
    if (found >= 0) return false;
    if (node.attrs?.block_id === place.blockId) {
      found = Math.min(position + 1 + place.offset, position + node.nodeSize - 1);
      return false;
    }
    return true;
  });
  return found < 0 ? null : selectionNearInlineContent(doc, found);
}

export const DocumentOpenCaret = Extension.create({
  name: "documentOpenCaret",

  addProseMirrorPlugins() {
    // The reader or a command has put the caret somewhere; opening is over.
    let placed = false;
    let clicked: BlockPlace | null = null;
    let becameEditable = false;

    const note = (view: EditorView, event: MouseEvent) => {
      if (event.button !== 0) return;
      if (view.editable) {
        placed = true;
        return;
      }
      const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
      clicked = hit ? blockPlaceAt(view.state.doc, hit.pos) : null;
    };

    return [
      new Plugin({
        key: documentOpenCaretKey,
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              note(view, event);
              return false;
            },
            keydown: (view) => {
              if (view.editable) placed = true;
              return false;
            },
          },
        },
        appendTransaction: (transactions, oldState, newState) => {
          const replacement = transactions.find(replacesWholeDocument);
          if (!replacement) {
            // A command's caret counts; one a plugin or the room set on its own does not.
            if (transactions.some((transaction) => (
              transaction.selectionSet
              && !transaction.getMeta("appendedTransaction")
              && !transaction.getMeta(ySyncPluginKey)
            ))) {
              placed = true;
            }
            return null;
          }
          // A command that rewrites everything and puts its own selection
          // (Sort of a page's only table) has placed it: a whole-column cell
          
          if (
            replacement.selectionSet
            && !replacement.getMeta("appendedTransaction")
            && !replacement.getMeta(ySyncPluginKey)
          ) {
            placed = true;
            return null;
          }
          if (placed) {
            // The room carries the caret across its own replacements.
            if (replacement.getMeta(ySyncPluginKey)) return null;
            const place = blockPlaceAt(oldState.doc, oldState.selection.head);
            const kept = place ? selectionAtPlace(newState.doc, place) : null;
            return kept ? newState.tr.setSelection(kept).setMeta("addToHistory", false) : null;
          }
          const start = Selection.atStart(newState.doc);
          if (newState.selection.eq(start)) return null;
          return newState.tr.setSelection(start).setMeta("addToHistory", false);
        },
        view: () => ({
          update: (view) => {
            if (becameEditable || !view.editable) return;
            becameEditable = true;
            const place = clicked;
            clicked = null;
            if (!placed && place) {
              const selection = selectionAtPlace(view.state.doc, place);
              if (selection) {
                view.dispatch(view.state.tr.setSelection(selection).setMeta("addToHistory", false));
                view.focus();
                return;
              }
            }
            const holder = document.activeElement;
            if (!placed && (!holder || holder === document.body || !holder.isConnected)) {
              view.focus();
            }
          },
        }),
      }),
    ];
  },
});

export default DocumentOpenCaret;
