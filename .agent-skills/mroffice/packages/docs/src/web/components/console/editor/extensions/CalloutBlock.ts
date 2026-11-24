/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes } from "@tiptap/core";

const CalloutBlock = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-variant") || "info",
        renderHTML: (attributes: Record<string, string>) => ({
          "data-variant": attributes.variant,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        class: `callout-block callout-${HTMLAttributes["data-variant"] || "info"}`,
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { $anchor } = editor.state.selection;
        const isAtStart =
          $anchor.parentOffset === 0 &&
          $anchor.depth > 1 &&
          $anchor.node($anchor.depth - 1).type.name === this.name;
        if (isAtStart) {
          return editor.chain().lift(this.name).run();
        }
        return false;
      },
    };
  },
});

export default CalloutBlock;
