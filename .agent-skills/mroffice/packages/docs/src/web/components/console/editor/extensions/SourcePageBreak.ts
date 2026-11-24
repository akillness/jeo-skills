/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { mergeAttributes, Node } from "@tiptap/core";

export const SOURCE_PAGE_BREAK_STYLE =
  "display: inline-block; width: 0; height: 0; overflow: hidden; vertical-align: top; pointer-events: none;";

/**
 * Read-only source-page boundary retained from an imported document.
 *
 * This is intentionally different from the user-insertable `pageBreak` block:
 * it is an invisible inline atom whose only job is to survive editor JSON/HTML
 * round-trips. It exposes no command and cannot be selected or dragged.
 */
const SourcePageBreak = Node.create({
  name: "sourcePageBreak",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'span[data-type="source-page-break"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "source-page-break",
        // Zero-size inline box: invisible to readers, but it retains an exact
        // line-top DOM coordinate for the editable paginator. `display:none`
        // would erase that coordinate and collapse every anchor to y=0.
        style: SOURCE_PAGE_BREAK_STYLE,
        "aria-hidden": "true",
        contenteditable: "false",
      }),
    ];
  },
});

export default SourcePageBreak;
