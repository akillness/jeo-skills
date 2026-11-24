/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes } from "@tiptap/core";

import { normalizeImageAlign } from "@mrnote/core/web/components/console/editor/native-document/imageControls.ts";

/**
 * A Word paragraph that contains two or more real inline pictures.
 *
 * Images remain ordinary editable/resizable `image` nodes; this block only
 * restores the paragraph-level layout box that DOCX projection used to throw
 * away.  That distinction matters for both alignment and pagination: centring
 * belongs to the whole row, never independently to every picture.
 */
export const ImageRow = Node.create({
  name: "imageRow",
  group: "block",
  content: "image+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      dataAlign: {
        default: null,
        parseHTML: (element) =>
          normalizeImageAlign(element.getAttribute("data-align")),
        renderHTML: (attrs) => {
          const align = normalizeImageAlign(
            (attrs as { dataAlign?: unknown }).dataAlign,
          );
          return align ? { "data-align": align } : {};
        },
      },
      sourcePageBreakBefore: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-source-page-break-before") === "true",
        renderHTML: (attrs) =>
          (attrs as { sourcePageBreakBefore?: unknown })
            .sourcePageBreakBefore === true
            ? { "data-source-page-break-before": "true" }
            : {},
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="image-row"]' },
      { tag: "div.note-editor-image-row" },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    // The row's tallest picture: on a line grid Word sets the paragraph's line
    // in whole slots (note-editor.css).
    let tallest = 0;
    node.forEach((child) => {
      const height = Number(child.attrs.height);
      if (Number.isFinite(height) && height > tallest) tallest = height;
    });
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "image-row",
        class: "note-editor-image-row",
        ...(tallest > 0 ? { style: `--image-row-height: ${tallest}px` } : {}),
      }),
      0,
    ];
  },
});

export default ImageRow;
