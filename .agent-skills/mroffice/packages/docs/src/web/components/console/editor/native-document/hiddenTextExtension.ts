"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Mark } from "@tiptap/core";

/** Word/WPS hidden run text (`<w:vanish>`). */
export const HIDDEN_TEXT_MARK = "hiddenText";

/**
 * FormattingMarks owns these view-only CSS custom properties. Keeping the
 * display state on the editor root lets one persisted mark render hidden by
 * default while Word's Show all / Hidden text preferences can reveal it
 * without rewriting document content or rebuilding every marked text node.
 */
export const HIDDEN_TEXT_DISPLAY_PROPERTY = "--mrnote-hidden-text-display";
export const HIDDEN_TEXT_DECORATION_PROPERTY =
  "--mrnote-hidden-text-decoration";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    hiddenText: {
      setHiddenText: () => ReturnType;
      toggleHiddenText: () => ReturnType;
      unsetHiddenText: () => ReturnType;
    };
  }
}

/**
 * Semantic hidden text mark.
 *
 * The mark itself is persisted in JSON/HTML and defaults to `display:none`.
 * Visibility is an application preference, not document data, so the
 * FormattingMarks ProseMirror plugin changes only root CSS variables via a
 * transaction-backed plugin state. The fallback remains hidden when this HTML
 * is rendered outside the editor.
 */
export const DocumentHiddenText = Mark.create({
  name: HIDDEN_TEXT_MARK,

  parseHTML() {
    return [{ tag: "span[data-hidden-text]" }];
  },

  renderHTML() {
    return [
      "span",
      {
        "data-hidden-text": "",
        style: `display: var(${HIDDEN_TEXT_DISPLAY_PROPERTY}, none); text-decoration: var(${HIDDEN_TEXT_DECORATION_PROPERTY}, none)`,
      },
      0,
    ];
  },

  addCommands() {
    return {
      setHiddenText:
        () =>
        ({ commands }) =>
          commands.setMark(HIDDEN_TEXT_MARK),
      toggleHiddenText:
        () =>
        ({ commands }) =>
          commands.toggleMark(HIDDEN_TEXT_MARK),
      unsetHiddenText:
        () =>
        ({ commands }) =>
          commands.unsetMark(HIDDEN_TEXT_MARK, { extendEmptyMarkRange: false }),
    };
  },
});
