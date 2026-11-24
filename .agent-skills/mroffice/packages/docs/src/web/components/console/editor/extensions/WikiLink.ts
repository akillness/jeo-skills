/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Mark, mergeAttributes } from "@tiptap/core";

export interface WikiLinkAttrs {
  target: string;
  display: string | null;
  resolved: boolean;
}

const WikiLink = Mark.create({
  name: "wikiLink",

  inclusive: false,

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-wikilink-target") ?? "",
        renderHTML: (attrs) =>
          attrs.target ? { "data-wikilink-target": attrs.target } : {},
      },
      display: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-wikilink-display") ?? null,
        renderHTML: (attrs) =>
          attrs.display ? { "data-wikilink-display": attrs.display } : {},
      },
      resolved: {
        default: false,
        parseHTML: (el) =>
          el.getAttribute("data-wikilink-resolved") === "true",
        renderHTML: (attrs) => ({
          "data-wikilink-resolved": attrs.resolved ? "true" : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-wikilink-target]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "wikilink",
      }),
      0,
    ];
  },

  // Atomic delete: a wiki-link is a single conceptual reference, so a
  // single Backspace anywhere inside (or immediately after) the marked
  // range should delete the *whole* range — not chip away one character
  // at a time, which would leave behind a corrupted target/display pair
  // (e.g. "Project Pla" still tagged with target "Project Plan").
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const $pos = selection.$from;
        // Look at the mark range immediately to the LEFT of the caret —
        // mirrors what the user perceives Backspace to delete.
        const before = $pos.nodeBefore;
        const beforeMark = before?.marks.find(
          (m) => m.type.name === this.name,
        );
        if (before && beforeMark) {
          const end = $pos.pos;
          const start = end - before.nodeSize;
          this.editor
            .chain()
            .focus()
            .deleteRange({ from: start, to: end })
            .run();
          return true;
        }
        // Caret sits inside the wiki-link mark (no nodeBefore boundary
        // hit, but the parent text node carries the mark). Find the
        // bounding range of consecutive wiki-link characters and drop
        // them all in one stroke.
        const parent = $pos.parent;
        const offset = $pos.parentOffset;
        if (offset === 0) return false;
        // Walk back through the parent's content to find the marked
        // range that includes the caret.
        let runStart = offset;
        let runEnd = offset;
        let cursor = 0;
        parent.forEach((child) => {
          const childStart = cursor;
          const childEnd = cursor + child.nodeSize;
          if (
            child.marks.some((m) => m.type.name === this.name) &&
            childStart < offset &&
            offset <= childEnd
          ) {
            runStart = Math.min(runStart, childStart);
            runEnd = Math.max(runEnd, childEnd);
          }
          cursor = childEnd;
        });
        if (runStart === runEnd || runStart >= offset) return false;
        const docStart = $pos.start();
        this.editor
          .chain()
          .focus()
          .deleteRange({ from: docStart + runStart, to: docStart + runEnd })
          .run();
        return true;
      },
    };
  },
});

export default WikiLink;
