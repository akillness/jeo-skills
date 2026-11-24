/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";

import { authoredBatchRoot } from "@mrnote/core/web/components/console/editor/native-document/sectionLayoutBoundarySync.ts";
import { imeReplayingAppendTransaction } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import { prepareBreakAtFloatSelection } from "@mrnote/core/web/components/console/editor/native-document/floatInsertionPoint.ts";

import {
  breakNodeOf,
  breakRefusalAt,
  insertStructuredBreak,
  reportBreakRefusal,
} from "@mrnote/core/web/components/console/editor/native-document/breakPlacement.ts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insert a hard page break at the current selection. */
      setPageBreak: () => ReturnType;
    };
  }
}

/**
 * A hard page break — Word/WPS parity. It is a leaf block (like a horizontal
 * rule) that renders a visible divider on screen and maps to a CSS
 * `page-break-before: always` / `break-before: page` in print/export contexts.
 *
 * Persisted as `<div data-type="page-break">` so it survives the HTML
 * round-trip used by import/export, and is registered in the schema via the
 * native-document plugin registry. Insertion goes through the `setPageBreak`
 * command, surfaced by the toolbar and the slash menu.
 */
/** Where a paragraph after a document-final page break goes, or null when the
 * document does not end in one (its body, or the last page's, ends there). */
export function trailingPageBreakParagraphPos(doc: PmNode): number | null {
  let container = doc;
  let end = doc.content.size;
  const last = doc.lastChild;
  if (last && last.type.name === "pageBlock") {
    container = last;
    end = doc.content.size - 1;
  }
  return container.lastChild?.type.name === "pageBreak" ? end : null;
}










export function trailingPageBreakParagraph(
  transactions: readonly Transaction[],
  state: EditorState,
): Transaction | null {
  // A transaction another plugin appended speaks for the edit it followed.
  const authored = (tr: Transaction) => authoredBatchRoot((tr.getMeta("appendedTransaction") as Transaction | undefined) ?? tr);
  if (!transactions.some((tr) => tr.docChanged && authored(tr))) return null;
  const pos = trailingPageBreakParagraphPos(state.doc);
  const paragraph = state.schema.nodes.paragraph;
  if (pos === null || !paragraph) return null;
  return state.tr.insert(pos, paragraph.create());
}

const trailingPageBreakKey = new PluginKey("trailingPageBreakParagraph");

const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  // No editable content; this is a leaf divider like horizontalRule.
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [
      { tag: 'div[data-type="page-break"]' },
      // Tolerate the common CSS page-break idiom from imported HTML.
      { tag: "div.page-break" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page-break",
        class: "note-editor-page-break",
        // Inline print mapping so the break survives a stylesheet-less export.
        style: "page-break-before: always; break-before: page;",
        "aria-hidden": "true",
        contenteditable: "false",
      }),
    ];
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: trailingPageBreakKey,
        appendTransaction: imeReplayingAppendTransaction((transactions, _oldState, newState) =>
          editor.isEditable ? trailingPageBreakParagraph(transactions, newState) : null),
      }),
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ editor, chain, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!prepareBreakAtFloatSelection(tr)) return false;
          // A list item, a table or a box the pages cannot cut around: Word's
          // own placement there, or a refusal that says why (WUA 004).
          const breakNode = breakNodeOf(state, this.name);
          if (!breakNode) return false;
          if (!dispatch) {
            const refusal = breakRefusalAt(state);
            return refusal === null;
          }
          const placed = insertStructuredBreak(tr, breakNode);
          if (placed.kind === "refused") {
            tr.setMeta("preventDispatch", true);
            reportBreakRefusal(editor, placed.reason);
            return false;
          }
          if (placed.kind === "placed") {
            tr.scrollIntoView();
            return true;
          }
          // Inside a paragraph the insertion itself splits it: the text after
          // the caret is the first paragraph of the next page (Word), and an
          
          // of a paragraph insert the break AND a trailing paragraph so the
          // caret has somewhere to land on the "next page"; without it an atom
          // leaf would be the last node and the selection stranded on the
          // (uneditable) break itself.
          const { $to } = tr.selection;
          const textAfter = $to.parent.isTextblock && $to.parentOffset < $to.parent.content.size;
          return chain()
            .insertContent(textAfter ? [{ type: this.name }] : [{ type: this.name }, { type: "paragraph" }])
            .run();
        },
    };
  },
});

export default PageBreak;
