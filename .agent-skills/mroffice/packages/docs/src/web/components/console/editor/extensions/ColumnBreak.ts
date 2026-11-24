/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { prepareBreakAtFloatSelection } from "@mrnote/core/web/components/console/editor/native-document/floatInsertionPoint.ts";
import { Node, mergeAttributes } from "@tiptap/core";

import {
  breakNodeOf,
  breakRefusalAt,
  insertStructuredBreak,
  reportBreakRefusal,
} from "@mrnote/core/web/components/console/editor/native-document/breakPlacement.ts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnBreak: {
      /** Insert a column break at the current selection. */
      setColumnBreak: () => ReturnType;
    };
  }
}

/**
 * A column break — Word/WPS "Layout ▸ Breaks ▸ Column" parity. Inside a
 * multi-column section it pushes the following text to the TOP of the next
 * column; it is the column-flow analogue of the hard page break. A leaf block
 * (like the page break / horizontal rule) that renders a labelled divider on
 * screen and maps to CSS `break-before: column` in print/export contexts and to
 * `<w:br w:type="column"/>` in DOCX.
 *
 * Persisted as `<div data-type="column-break">` so it survives the HTML
 * round-trip used by import/export, and is registered in the schema via the
 * native-document plugin registry. Insertion goes through the `setColumnBreak`
 * command, surfaced by the toolbar and the slash menu.
 */
const ColumnBreak = Node.create({
  name: "columnBreak",
  group: "block",
  // No editable content; this is a leaf divider like horizontalRule / pageBreak.
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [
      { tag: 'div[data-type="column-break"]' },
      // Tolerate the common CSS column-break idiom from imported HTML.
      { tag: "div.column-break" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "column-break",
        class: "note-editor-column-break",
        // Inline column mapping so the break survives a stylesheet-less export.
        style: "break-before: column; -webkit-column-break-before: always;",
        "aria-hidden": "true",
        contenteditable: "false",
      }),
    ];
  },

  addCommands() {
    return {
      setColumnBreak:
        () =>
        ({ editor, chain, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!prepareBreakAtFloatSelection(tr)) return false;
          // In a list item or a table the break goes where Word puts it (the
          // page break's placement); a box the pages cannot cut refuses it.
          const breakNode = breakNodeOf(state, this.name);
          if (!breakNode) return false;
          if (!dispatch) return breakRefusalAt(state) === null;
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
          // Insert the break AND a trailing paragraph so the caret has somewhere
          // to land in the "next column". Without the paragraph, an atom leaf is
          // the last node and the selection is stranded on the (uneditable)
          // break itself, so the user can't type after inserting it.
          return chain()
            .insertContent([{ type: this.name }, { type: "paragraph" }])
            .run();
        },
    };
  },
});

export default ColumnBreak;
