"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Table-of-contents entry marks — the caption and the page number of a Word
 * TOC line, tagged on import so the editor can paint a Word-style dot leader
 * with the page number right-aligned.
 *
 * A Word TOC field stores each entry as `"Caption\t<page>"`. The docx importer
 * (projection_to_page.py `_toc_entry_inline`) splits on the tab, wraps the
 * caption in a `tocEntryTitle` mark and the number in a `tocEntryPage` mark,
 * and drops the tab; the paragraph also carries a `data-toc-level` attr (see
 * DocumentFormatting). The `.toc-entry__*` CSS (note-editor.css) then renders
 * the two spans with a dotted leader filling the gap between them.
 *
 * ADDITIVE + purely visual: both marks are attribute-free and round-trip
 * through the schema's open `marks` passthrough. A document with no TOC entries
 * carries neither mark and is byte-for-byte unchanged. On DOCX export the marks
 * are unknown to the exporter and ignored, so the entry exports as plain text.
 */

export const TOC_ENTRY_TITLE_MARK_NAME = "tocEntryTitle";
export const TOC_ENTRY_PAGE_MARK_NAME = "tocEntryPage";

export const TocEntryTitleMark = Mark.create({
  name: TOC_ENTRY_TITLE_MARK_NAME,
  // Link uses priority 1000; ordinary formatting marks use the default 100.
  // Sitting between them keeps one outer <a>, then one spanning TOC title
  // wrapper around differently-formatted text and inline formula atoms.
  priority: 900,
  // A TOC caption is inclusive-spanning like a normal styling mark.
  inclusive: false,

  parseHTML() {
    return [{ tag: "span.toc-entry__title" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "toc-entry__title" }),
      0,
    ];
  },
});

export const TocEntryPageMark = Mark.create({
  name: TOC_ENTRY_PAGE_MARK_NAME,
  priority: 900,
  inclusive: false,

  parseHTML() {
    return [{ tag: "span.toc-entry__page" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "toc-entry__page" }),
      0,
    ];
  },
});
